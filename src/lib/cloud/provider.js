// Cloud provider abstraction.
//
// The PRD stores weekly JSON files in a cloud folder (e.g. OneDrive
// `/Apps/EdgeTimeTracker/`). Everything above this layer only ever deals with
// "a flat folder of named JSON files", so swapping providers (OneDrive, a
// local simulator for offline use, or anything else later) changes nothing
// else in the codebase.
//
// A provider implements:
//   isConnected(): Promise<boolean>
//   connect(): Promise<void>            // interactive auth, where applicable
//   disconnect(): Promise<void>
//   list(): Promise<string[]>           // file names in the app folder
//   read(name): Promise<string|null>    // file contents, or null if missing
//   write(name, contents): Promise<void>
//   remove(name): Promise<void>

import { LocalProvider } from './local-provider.js';
import { OneDriveProvider } from './onedrive-provider.js';

export const PROVIDER_IDS = {
  LOCAL: 'local',
  ONEDRIVE: 'onedrive',
};

const SETTINGS_KEY = 'cloudSettings';

/** Read persisted cloud settings (which provider, OneDrive client id, ...). */
export async function getCloudSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    provider: PROVIDER_IDS.LOCAL,
    oneDriveClientId: '',
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

/** Instantiate the provider selected in settings. */
export async function getProvider() {
  const settings = await getCloudSettings();
  switch (settings.provider) {
    case PROVIDER_IDS.ONEDRIVE:
      return new OneDriveProvider(settings);
    case PROVIDER_IDS.LOCAL:
    default:
      return new LocalProvider(settings);
  }
}
