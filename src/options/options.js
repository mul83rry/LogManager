import { send } from '../ui/messaging.js';
import { initI18n, watchLang, getLang, setLang, t } from '../lib/i18n.js';

const els = {
  langSelect: document.getElementById('lang-select'),
  deviceId: document.getElementById('device-id'),
  deviceLabel: document.getElementById('device-label'),
  filePreview: document.getElementById('file-preview'),
  provider: document.getElementById('provider'),
  onedriveConfig: document.getElementById('onedrive-config'),
  clientId: document.getElementById('client-id'),
  redirectUri: document.getElementById('redirect-uri'),
  connect: document.getElementById('connect'),
  disconnect: document.getElementById('disconnect'),
  cloudStatus: document.getElementById('cloud-status'),
  message: document.getElementById('message'),
  error: document.getElementById('error'),
};

els.redirectUri.textContent = chrome.identity?.getRedirectURL?.() || '(unavailable)';

function notify(msg) {
  els.message.textContent = msg;
  setTimeout(() => { if (els.message.textContent === msg) els.message.textContent = ''; }, 2500);
}
function showError(err) {
  els.error.textContent = err;
  els.error.hidden = !err;
}

async function load() {
  const state = await send('getState');
  els.deviceId.textContent = state.device.id;
  els.deviceLabel.value = state.device.label || '';
  const w = String(state.week.week).padStart(2, '0');
  els.filePreview.textContent = `${state.filePrefix}_W${w}_Y${state.week.year}.json`;
  els.provider.value = state.cloud.provider;
  els.clientId.value = state.cloud.oneDriveClientId || '';
  syncProviderUi(state.cloud);
}

function syncProviderUi(cloud) {
  const isOneDrive = els.provider.value === 'onedrive';
  els.onedriveConfig.hidden = !isOneDrive;
  els.connect.hidden = !(isOneDrive && !cloud.connected);
  els.disconnect.hidden = !(isOneDrive && cloud.connected);
  if (!isOneDrive) {
    els.cloudStatus.textContent = t('statusLocal');
    els.cloudStatus.className = 'tag';
  } else {
    els.cloudStatus.textContent = cloud.connected ? t('statusConnected') : t('statusOffline');
    els.cloudStatus.className = cloud.connected ? 'tag live' : 'tag';
  }
}

els.provider.addEventListener('change', () => syncProviderUi({ connected: false }));

// ── language section ────────────────────────────────────────────────────────
els.langSelect.addEventListener('change', async () => {
  await setLang(els.langSelect.value);
  // watchLang() fires window.location.reload() via storage event.
});

// ── device section ──────────────────────────────────────────────────────────
document.getElementById('save-label').addEventListener('click', async () => {
  try {
    showError('');
    await send('setDeviceLabel', { label: els.deviceLabel.value });
    notify(t('msgLabelSaved'));
    await load();
  } catch (err) { showError(err.message); }
});

// ── cloud section ───────────────────────────────────────────────────────────
document.getElementById('save-provider').addEventListener('click', async () => {
  try {
    showError('');
    await send('setCloudSettings', {
      patch: { provider: els.provider.value, oneDriveClientId: els.clientId.value.trim() },
    });
    notify(t('msgCloudSaved'));
    await load();
  } catch (err) { showError(err.message); }
});

els.connect.addEventListener('click', async () => {
  try {
    showError('');
    notify(t('msgConnecting'));
    await send('cloudConnect');
    notify(t('msgConnected'));
    await load();
  } catch (err) { showError(err.message); }
});

els.disconnect.addEventListener('click', async () => {
  try {
    showError('');
    await send('cloudDisconnect');
    notify(t('msgDisconnected'));
    await load();
  } catch (err) { showError(err.message); }
});

// ── init ────────────────────────────────────────────────────────────────────
watchLang();
await initI18n();
els.langSelect.value = await getLang();
load().catch((err) => showError(err.message));
