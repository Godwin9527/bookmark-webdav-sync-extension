// storage-helper.js — chrome.storage.local 封装

const KEYS = {
  SETTINGS: 'settings',
  BASE_SNAPSHOT: 'baseSnapshot',
  SYNC_STATE: 'syncState',
  PENDING_RESTORE: 'pendingRestore',
  SYNC_LOCK: 'syncLock',
};

const DEFAULT_SETTINGS = {
  webdavUrl: '',
  username: '',
  password: '',
  backupEnabled: false,
  backupIntervalMinutes: 60,
  syncEnabled: false,
  syncIntervalMinutes: 30,
  storagePath: '/bookmark-sync/',
};

const DEFAULT_SYNC_STATE = {
  lastBackupTime: null,
  lastSyncTime: null,
  lastPushTime: null,
  lastPullTime: null,
  status: 'idle',       // idle | running | error
  lastError: null,
  lastOperation: null,
};

// 轻量混淆 key（非真正加密，仅防止明文可见）
const OBF_KEY = 'BmkSync2024!@#XoR';

function obfuscate(text) {
  if (!text) return '';
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length)
    );
  }
  return btoa(result);
}

function deobfuscate(encoded) {
  if (!encoded) return '';
  const text = atob(encoded);
  let result = '';
  for (let i = 0; i < text.length; i++) {
    result += String.fromCharCode(
      text.charCodeAt(i) ^ OBF_KEY.charCodeAt(i % OBF_KEY.length)
    );
  }
  return result;
}

async function get(key) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? null;
}

async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

// ——— Settings ———

export async function getSettings() {
  const saved = await get(KEYS.SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  // 解混淆密码
  if (settings._pwd) {
    settings.password = deobfuscate(settings._pwd);
    delete settings._pwd;
  }
  return settings;
}

export async function saveSettings(settings) {
  const toSave = { ...settings };
  // 混淆密码
  if (toSave.password) {
    toSave._pwd = obfuscate(toSave.password);
    delete toSave.password;
  }
  await set(KEYS.SETTINGS, toSave);
}

// ——— Base Snapshot（三路合并的基线）———

export async function getBaseSnapshot() {
  return await get(KEYS.BASE_SNAPSHOT);
}

export async function saveBaseSnapshot(tree) {
  await set(KEYS.BASE_SNAPSHOT, tree);
}

// ——— Sync State（同步状态元数据）———

export async function getSyncState() {
  const saved = await get(KEYS.SYNC_STATE);
  return { ...DEFAULT_SYNC_STATE, ...saved };
}

export async function saveSyncState(state) {
  await set(KEYS.SYNC_STATE, state);
}

export async function updateSyncState(partial) {
  const current = await getSyncState();
  await saveSyncState({ ...current, ...partial });
}

// ——— Pending Restore（崩溃恢复）———

export async function getPendingRestore() {
  return await get(KEYS.PENDING_RESTORE);
}

export async function savePendingRestore(tree) {
  await set(KEYS.PENDING_RESTORE, tree);
}

export async function clearPendingRestore() {
  await chrome.storage.local.remove(KEYS.PENDING_RESTORE);
}

// ——— Sync Lock（同步锁）———

export async function acquireLock() {
  const lock = await get(KEYS.SYNC_LOCK);
  if (lock && Date.now() - lock.time < 5 * 60 * 1000) {
    // 5 分钟内的锁仍有效
    return false;
  }
  await set(KEYS.SYNC_LOCK, { time: Date.now() });
  return true;
}

export async function releaseLock() {
  await chrome.storage.local.remove(KEYS.SYNC_LOCK);
}
