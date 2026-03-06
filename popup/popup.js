// popup.js — 弹出界面逻辑

// ——— DOM 引用 ———
const $ = (id) => document.getElementById(id);

const els = {
  // 连接设置
  webdavUrl: $('webdavUrl'),
  username: $('username'),
  password: $('password'),
  storagePath: $('storagePath'),
  btnTestConnection: $('btnTestConnection'),
  btnSaveSettings: $('btnSaveSettings'),
  connectionStatus: $('connectionStatus'),

  // 备份
  backupEnabled: $('backupEnabled'),
  backupInterval: $('backupInterval'),
  lastBackupTime: $('lastBackupTime'),
  btnBackupNow: $('btnBackupNow'),

  // 同步
  syncEnabled: $('syncEnabled'),
  syncInterval: $('syncInterval'),
  lastSyncTime: $('lastSyncTime'),
  btnSyncNow: $('btnSyncNow'),

  // 手动操作
  btnPush: $('btnPush'),
  btnPull: $('btnPull'),
  lastPushTime: $('lastPushTime'),
  lastPullTime: $('lastPullTime'),

  // 状态
  statusBadge: $('statusBadge'),
  toast: $('toast'),

  // 确认对话框
  confirmOverlay: $('confirmOverlay'),
  confirmMessage: $('confirmMessage'),
  confirmCancel: $('confirmCancel'),
  confirmOk: $('confirmOk'),
};

// ——— 工具函数 ———

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function formatTime(timestamp) {
  if (!timestamp) return '从未';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';

  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function showToast(message, type = 'info') {
  els.toast.textContent = message;
  els.toast.className = 'toast ' + type;

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    els.toast.classList.add('hidden');
  }, 3000);
}

function updateStatusBadge(status) {
  const map = {
    idle: ['idle', '空闲'],
    running: ['running', '运行中'],
    error: ['error', '错误'],
  };
  const [cls, text] = map[status] || map.idle;
  els.statusBadge.className = 'badge ' + cls;
  els.statusBadge.textContent = text;
}

function setConnectionStatus(message, type) {
  els.connectionStatus.textContent = message;
  els.connectionStatus.className = 'status-msg ' + (type || '');
}

function setButtonLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn._originalText = btn.textContent;
    btn.textContent = '处理中...';
  } else if (btn._originalText) {
    btn.textContent = btn._originalText;
  }
}

function confirm(message) {
  return new Promise((resolve) => {
    els.confirmMessage.textContent = message;
    els.confirmOverlay.classList.remove('hidden');

    const cleanup = () => {
      els.confirmOverlay.classList.add('hidden');
      els.confirmOk.removeEventListener('click', onOk);
      els.confirmCancel.removeEventListener('click', onCancel);
    };

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };

    els.confirmOk.addEventListener('click', onOk);
    els.confirmCancel.addEventListener('click', onCancel);
  });
}

// 用于保存实际密码（不是掩码）
let actualPassword = '';

// ——— 加载状态 ———

async function loadStatus() {
  const result = await sendMessage({ action: 'getStatus' });
  if (!result) return;

  const { settings, syncState } = result;

  // 填充设置（仅当用户未在编辑时）
  if (!document.activeElement || document.activeElement.tagName !== 'INPUT') {
    els.webdavUrl.value = settings.webdavUrl || '';
    els.username.value = settings.username || '';
    els.storagePath.value = settings.storagePath || '/bookmark-sync/';
    // 密码显示掩码
    if (result.hasPassword && !actualPassword) {
      els.password.placeholder = '已保存（重新输入可更改）';
    }
  }

  els.backupEnabled.checked = settings.backupEnabled || false;
  els.backupInterval.value = String(settings.backupIntervalMinutes || 60);
  els.syncEnabled.checked = settings.syncEnabled || false;
  els.syncInterval.value = String(settings.syncIntervalMinutes || 30);

  // 时间显示
  els.lastBackupTime.textContent = formatTime(syncState.lastBackupTime);
  els.lastSyncTime.textContent = formatTime(syncState.lastSyncTime);
  els.lastPushTime.textContent = formatTime(syncState.lastPushTime);
  els.lastPullTime.textContent = formatTime(syncState.lastPullTime);

  // 状态徽章
  updateStatusBadge(syncState.status);

  // 如果有错误显示
  if (syncState.status === 'error' && syncState.lastError) {
    showToast(syncState.lastError, 'error');
  }
}

// ——— 事件绑定 ———

// 折叠切换
document.querySelectorAll('[data-toggle]').forEach((el) => {
  el.addEventListener('click', () => {
    const target = document.getElementById(el.dataset.toggle);
    if (target) {
      target.classList.toggle('collapsed');
      const arrow = el.querySelector('.arrow');
      if (arrow) {
        arrow.textContent = target.classList.contains('collapsed') ? '▸' : '▾';
      }
    }
  });
});

// 测试连接
els.btnTestConnection.addEventListener('click', async () => {
  const url = els.webdavUrl.value.trim();
  const username = els.username.value.trim();
  const pwd = els.password.value || actualPassword;

  if (!url || !username || !pwd) {
    setConnectionStatus('请填写完整的连接信息', 'error');
    return;
  }

  setButtonLoading(els.btnTestConnection, true);
  setConnectionStatus('连接中...', '');

  const result = await sendMessage({
    action: 'testConnection',
    url, username, password: pwd,
  });

  setButtonLoading(els.btnTestConnection, false);
  setConnectionStatus(result.message, result.ok ? 'success' : 'error');
});

// 保存设置
els.btnSaveSettings.addEventListener('click', async () => {
  const pwd = els.password.value || actualPassword;

  const settings = {
    webdavUrl: els.webdavUrl.value.trim(),
    username: els.username.value.trim(),
    password: pwd,
    storagePath: els.storagePath.value.trim() || '/bookmark-sync/',
    backupEnabled: els.backupEnabled.checked,
    backupIntervalMinutes: parseInt(els.backupInterval.value),
    syncEnabled: els.syncEnabled.checked,
    syncIntervalMinutes: parseInt(els.syncInterval.value),
  };

  setButtonLoading(els.btnSaveSettings, true);
  await sendMessage({ action: 'saveSettings', settings });
  setButtonLoading(els.btnSaveSettings, false);

  if (pwd) {
    actualPassword = pwd;
    els.password.value = '';
    els.password.placeholder = '已保存（重新输入可更改）';
  }

  showToast('设置已保存', 'success');
});

// 密码输入时记录
els.password.addEventListener('input', () => {
  if (els.password.value) {
    actualPassword = els.password.value;
  }
});

// 开关变更时自动保存
els.backupEnabled.addEventListener('change', saveToggles);
els.syncEnabled.addEventListener('change', saveToggles);
els.backupInterval.addEventListener('change', saveToggles);
els.syncInterval.addEventListener('change', saveToggles);

async function saveToggles() {
  // 先获取完整设置再更新
  const fullSettings = await sendMessage({ action: 'getSettings' });

  fullSettings.backupEnabled = els.backupEnabled.checked;
  fullSettings.backupIntervalMinutes = parseInt(els.backupInterval.value);
  fullSettings.syncEnabled = els.syncEnabled.checked;
  fullSettings.syncIntervalMinutes = parseInt(els.syncInterval.value);

  await sendMessage({ action: 'saveSettings', settings: fullSettings });
}

// 立即备份
els.btnBackupNow.addEventListener('click', async () => {
  setButtonLoading(els.btnBackupNow, true);
  const result = await sendMessage({ action: 'triggerBackup' });
  setButtonLoading(els.btnBackupNow, false);
  showToast(result.message, result.success ? 'success' : 'error');
  await loadStatus();
});

// 立即同步
els.btnSyncNow.addEventListener('click', async () => {
  setButtonLoading(els.btnSyncNow, true);
  const result = await sendMessage({ action: 'triggerSync' });
  setButtonLoading(els.btnSyncNow, false);
  showToast(result.message, result.success ? 'success' : 'error');
  await loadStatus();
});

// 推送到云端
els.btnPush.addEventListener('click', async () => {
  const ok = await confirm('将本地书签推送到云端，覆盖云端现有数据。是否继续？');
  if (!ok) return;

  setButtonLoading(els.btnPush, true);
  const result = await sendMessage({ action: 'forcePush' });
  setButtonLoading(els.btnPush, false);
  showToast(result.message, result.success ? 'success' : 'error');
  await loadStatus();
});

// 从云端拉取
els.btnPull.addEventListener('click', async () => {
  const ok = await confirm(
    '从云端拉取书签将清除所有本地书签，并替换为云端版本。此操作不可撤销，是否继续？'
  );
  if (!ok) return;

  setButtonLoading(els.btnPull, true);
  const result = await sendMessage({ action: 'forcePull' });
  setButtonLoading(els.btnPull, false);
  showToast(result.message, result.success ? 'success' : 'error');
  await loadStatus();
});

// ——— 初始化 ———

loadStatus();

// 定期刷新状态（每 5 秒）
setInterval(loadStatus, 5000);
