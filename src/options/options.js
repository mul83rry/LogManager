import { send } from '../ui/messaging.js';

const els = {
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

els.redirectUri.textContent = chrome.identity?.getRedirectURL?.() || '(در دسترس نیست)';

function notify(text) {
  els.message.textContent = text;
  setTimeout(() => {
    if (els.message.textContent === text) els.message.textContent = '';
  }, 2500);
}
function showError(err) {
  els.error.textContent = err;
  els.error.hidden = !err;
}

async function load() {
  const state = await send('getState');
  els.deviceId.textContent = state.device.id;
  els.deviceLabel.value = state.device.label || '';
  els.filePreview.textContent = filePreview(state.filePrefix, state.week);
  els.provider.value = state.cloud.provider;
  els.clientId.value = state.cloud.oneDriveClientId || '';
  syncProviderUi(state.cloud);
}

function filePreview(prefix, week) {
  const w = String(week.week).padStart(2, '0');
  return `${prefix}_W${w}_Y${week.year}.json`;
}

function syncProviderUi(cloud) {
  const isOneDrive = els.provider.value === 'onedrive';
  els.onedriveConfig.hidden = !isOneDrive;
  els.connect.hidden = !(isOneDrive && !cloud.connected);
  els.disconnect.hidden = !(isOneDrive && cloud.connected);
  if (!isOneDrive) {
    els.cloudStatus.textContent = 'محلی';
    els.cloudStatus.className = 'tag';
  } else {
    els.cloudStatus.textContent = cloud.connected ? 'متصل' : 'قطع';
    els.cloudStatus.className = cloud.connected ? 'tag live' : 'tag';
  }
}

els.provider.addEventListener('change', () => syncProviderUi({ connected: false }));

document.getElementById('save-label').addEventListener('click', async () => {
  try {
    showError('');
    await send('setDeviceLabel', { label: els.deviceLabel.value });
    notify('نام دستگاه ذخیره شد.');
    await load();
  } catch (err) {
    showError(err.message);
  }
});

document.getElementById('save-provider').addEventListener('click', async () => {
  try {
    showError('');
    await send('setCloudSettings', {
      patch: {
        provider: els.provider.value,
        oneDriveClientId: els.clientId.value.trim(),
      },
    });
    notify('تنظیمات کلاد ذخیره شد.');
    await load();
  } catch (err) {
    showError(err.message);
  }
});

els.connect.addEventListener('click', async () => {
  try {
    showError('');
    notify('در حال اتصال...');
    await send('cloudConnect');
    notify('با موفقیت متصل شد.');
    await load();
  } catch (err) {
    showError(err.message);
  }
});

els.disconnect.addEventListener('click', async () => {
  try {
    showError('');
    await send('cloudDisconnect');
    notify('اتصال قطع شد.');
    await load();
  } catch (err) {
    showError(err.message);
  }
});

load().catch((err) => showError(err.message));
