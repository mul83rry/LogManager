// Cloud provider abstraction.
//
// A provider implements:
//   isConnected(): Promise<boolean>
//   connect(): Promise<void>
//   disconnect(): Promise<void>
//   list(): Promise<string[]>
//   read(name): Promise<string|null>
//   write(name, contents): Promise<void>
//   remove(name): Promise<void>

import { LocalProvider } from './local-provider.js';
import { OneDriveProvider } from './onedrive-provider.js';
import { ServerProvider } from './server-provider.js';

export const PROVIDER_IDS = {
  LOCAL: 'local',
  ONEDRIVE: 'onedrive',
  SERVER: 'server',
};

const SETTINGS_KEY = 'cloudSettings';

export async function getCloudSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    provider: PROVIDER_IDS.LOCAL,
    oneDriveClientId: '',
    serverUrl: '',
    folder: 'EdgeTimeTracker',
    ...(settings || {}),
  };
}

export async function setCloudSettings(patch) {
  const current = await getCloudSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getProvider() {
  const settings = await getCloudSettings();
  switch (settings.provider) {
    case PROVIDER_IDS.ONEDRIVE:
      return new OneDriveProvider(settings);
    case PROVIDER_IDS.SERVER:
      return new ServerProvider(settings);
    case PROVIDER_IDS.LOCAL:
    default:
      return new LocalProvider(settings);
  }
}
