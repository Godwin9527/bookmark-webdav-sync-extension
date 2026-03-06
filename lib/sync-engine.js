// sync-engine.js — 同步引擎核心

import { WebDAVClient } from './webdav-client.js';
import * as BookmarkManager from './bookmark-manager.js';
import * as Storage from './storage-helper.js';
import { threeWayMerge, mergeWithoutBase } from './merge-utils.js';

/**
 * 创建 WebDAV 客户端实例
 */
async function createClient() {
  const settings = await Storage.getSettings();
  if (!settings.webdavUrl || !settings.username || !settings.password) {
    throw new Error('WebDAV 连接信息未配置');
  }
  return {
    client: new WebDAVClient(settings.webdavUrl, settings.username, settings.password),
    settings,
  };
}

/**
 * 获取云端书签文件完整路径
 */
function getFilePath(settings) {
  const dir = settings.storagePath || '/bookmark-sync/';
  return dir.replace(/\/+$/, '') + '/bookmarks.json';
}

/**
 * 带锁执行操作
 */
async function withLock(operation, operationName) {
  const acquired = await Storage.acquireLock();
  if (!acquired) {
    return { success: false, message: '另一个同步操作正在进行中' };
  }

  await Storage.updateSyncState({
    status: 'running',
    lastOperation: operationName,
    lastError: null,
  });

  try {
    const result = await operation();
    await Storage.updateSyncState({ status: 'idle' });
    return { success: true, ...result };
  } catch (err) {
    await Storage.updateSyncState({
      status: 'error',
      lastError: err.message,
    });
    return { success: false, message: err.message };
  } finally {
    await Storage.releaseLock();
  }
}

// ——— 四种同步操作 ———

/**
 * 单向备份：本地 → 云端（覆盖云端）
 */
export async function oneWayBackup() {
  return withLock(async () => {
    const { client, settings } = await createClient();
    const filePath = getFilePath(settings);

    // 读取本地书签
    const localTree = await BookmarkManager.readTree();

    // 确保目录存在并上传
    await client.ensureCollection(settings.storagePath || '/bookmark-sync/');
    await client.put(filePath, localTree);

    await Storage.updateSyncState({ lastBackupTime: Date.now() });
    return { message: '备份成功' };
  }, 'backup');
}

/**
 * 双向同步：三路合并后替换两侧
 */
export async function twoWaySync() {
  return withLock(async () => {
    const { client, settings } = await createClient();
    const filePath = getFilePath(settings);

    // 读取三方数据
    const localTree = await BookmarkManager.readTree();
    const cloudTree = await client.get(filePath);
    const baseTree = await Storage.getBaseSnapshot();

    let mergedTree;

    if (!cloudTree) {
      // 云端无数据，首次同步 → 推送本地到云端
      await client.ensureCollection(settings.storagePath || '/bookmark-sync/');
      await client.put(filePath, localTree);
      await Storage.saveBaseSnapshot(localTree);
      await Storage.updateSyncState({ lastSyncTime: Date.now() });
      return { message: '首次同步：已推送本地书签到云端' };
    }

    if (!baseTree) {
      // 无基线 → 联合合并
      mergedTree = mergeWithoutBase(localTree, cloudTree);
    } else {
      // 三路合并
      mergedTree = threeWayMerge(localTree, cloudTree, baseTree);
    }

    // 保存崩溃恢复数据
    await Storage.savePendingRestore(mergedTree);

    // 清除并重写本地书签
    await BookmarkManager.writeTree(mergedTree);

    // 清除崩溃恢复标记
    await Storage.clearPendingRestore();

    // 上传合并结果到云端
    await client.put(filePath, mergedTree);

    // 保存新基线
    await Storage.saveBaseSnapshot(mergedTree);

    await Storage.updateSyncState({ lastSyncTime: Date.now() });
    return { message: '双向同步完成' };
  }, 'sync');
}

/**
 * 强制推送：本地覆盖云端
 */
export async function forcePush() {
  return withLock(async () => {
    const { client, settings } = await createClient();
    const filePath = getFilePath(settings);

    const localTree = await BookmarkManager.readTree();

    await client.ensureCollection(settings.storagePath || '/bookmark-sync/');
    await client.put(filePath, localTree);

    // 推送后更新基线
    await Storage.saveBaseSnapshot(localTree);

    await Storage.updateSyncState({ lastPushTime: Date.now() });
    return { message: '已推送到云端' };
  }, 'push');
}

/**
 * 强制拉取：云端覆盖本地
 */
export async function forcePull() {
  return withLock(async () => {
    const { client, settings } = await createClient();
    const filePath = getFilePath(settings);

    const cloudTree = await client.get(filePath);
    if (!cloudTree) {
      return { message: '云端无数据可拉取' };
    }

    // 验证数据结构
    if (!cloudTree.roots) {
      throw new Error('云端数据格式无效');
    }

    // 保存崩溃恢复数据
    await Storage.savePendingRestore(cloudTree);

    // 清除并重写本地书签
    await BookmarkManager.writeTree(cloudTree);

    // 清除崩溃恢复标记
    await Storage.clearPendingRestore();

    // 拉取后更新基线
    await Storage.saveBaseSnapshot(cloudTree);

    await Storage.updateSyncState({ lastPullTime: Date.now() });
    return { message: '已从云端拉取' };
  }, 'pull');
}

/**
 * 测试 WebDAV 连接
 */
export async function testConnection(url, username, password) {
  const client = new WebDAVClient(url, username, password);
  return await client.testConnection();
}

/**
 * 崩溃恢复：检查并恢复未完成的写入
 */
export async function recoverPending() {
  const pending = await Storage.getPendingRestore();
  if (!pending) return false;

  try {
    await BookmarkManager.writeTree(pending);
    await Storage.clearPendingRestore();
    console.log('[BookmarkSync] 崩溃恢复成功');
    return true;
  } catch (err) {
    console.error('[BookmarkSync] 崩溃恢复失败:', err);
    return false;
  }
}
