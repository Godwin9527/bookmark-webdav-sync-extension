// background.js — Service Worker 入口

import * as SyncEngine from './lib/sync-engine.js';
import * as Storage from './lib/storage-helper.js';

// ——— 定时器监听（必须在顶层注册）———

chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('[BookmarkSync] 定时器触发:', alarm.name);

  if (alarm.name === 'bookmark-backup') {
    const result = await SyncEngine.oneWayBackup();
    console.log('[BookmarkSync] 自动备份:', result.message);
  } else if (alarm.name === 'bookmark-sync') {
    const result = await SyncEngine.twoWaySync();
    console.log('[BookmarkSync] 自动同步:', result.message);
  }
});

// ——— 消息处理（popup ↔ background 通信）———

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // 异步响应
});

async function handleMessage(message) {
  switch (message.action) {
    case 'getStatus': {
      const settings = await Storage.getSettings();
      const syncState = await Storage.getSyncState();
      // 不返回密码明文给 popup
      return {
        settings: { ...settings, password: settings.password ? '••••••' : '' },
        syncState,
        hasPassword: !!settings.password,
      };
    }

    case 'getSettings': {
      return await Storage.getSettings();
    }

    case 'saveSettings': {
      await Storage.saveSettings(message.settings);
      await ensureAlarms();
      return { success: true };
    }

    case 'testConnection': {
      return await SyncEngine.testConnection(
        message.url,
        message.username,
        message.password
      );
    }

    case 'forcePush':
      return await SyncEngine.forcePush();

    case 'forcePull':
      return await SyncEngine.forcePull();

    case 'triggerBackup':
      return await SyncEngine.oneWayBackup();

    case 'triggerSync':
      return await SyncEngine.twoWaySync();

    default:
      return { success: false, message: '未知操作: ' + message.action };
  }
}

// ——— 定时器管理 ———

async function ensureAlarms() {
  const settings = await Storage.getSettings();

  // 单向备份定时器
  if (settings.backupEnabled) {
    const existing = await chrome.alarms.get('bookmark-backup');
    const interval = Math.max(settings.backupIntervalMinutes || 60, 1);
    if (!existing || existing.periodInMinutes !== interval) {
      await chrome.alarms.clear('bookmark-backup');
      await chrome.alarms.create('bookmark-backup', {
        delayInMinutes: interval,
        periodInMinutes: interval,
      });
      console.log('[BookmarkSync] 备份定时器已设置:', interval, '分钟');
    }
  } else {
    await chrome.alarms.clear('bookmark-backup');
  }

  // 双向同步定时器
  if (settings.syncEnabled) {
    const existing = await chrome.alarms.get('bookmark-sync');
    const interval = Math.max(settings.syncIntervalMinutes || 30, 1);
    if (!existing || existing.periodInMinutes !== interval) {
      await chrome.alarms.clear('bookmark-sync');
      await chrome.alarms.create('bookmark-sync', {
        delayInMinutes: interval,
        periodInMinutes: interval,
      });
      console.log('[BookmarkSync] 同步定时器已设置:', interval, '分钟');
    }
  } else {
    await chrome.alarms.clear('bookmark-sync');
  }
}

// ——— 启动时初始化 ———

async function init() {
  console.log('[BookmarkSync] Service Worker 启动');

  // 崩溃恢复
  await SyncEngine.recoverPending();

  // 确保定时器正确
  await ensureAlarms();
}

// 安装时初始化默认设置
chrome.runtime.onInstalled.addListener(async () => {
  const settings = await Storage.getSettings();
  if (!settings.webdavUrl) {
    await Storage.saveSettings(settings);
  }
  console.log('[BookmarkSync] 扩展已安装/更新');
});

init();
