// Device identity (PRD §2).
//
// On first install a unique id is generated with crypto.randomUUID() and kept
// in chrome.storage.local. The user may give the device a friendly label
// (e.g. "Laptop-Ali") in the options page; that label becomes the file-name
// prefix, so files read `Laptop-Ali_W02_Y1403.json`.

const DEVICE_KEY = 'device';

/** Get (or lazily create) this device's identity. */
export async function getDevice() {
  const { [DEVICE_KEY]: device } = await chrome.storage.local.get(DEVICE_KEY);
  if (device && device.id) return device;

  const fresh = {
    // Short, file-name-friendly slice of a UUID, e.g. "a1b2c3d4".
    id: crypto.randomUUID().replace(/-/g, '').slice(0, 8),
    createdAt: new Date().toISOString(),
  };
  await chrome.storage.local.set({ [DEVICE_KEY]: fresh });
  return fresh;
}

/**
 * The id used as the file-name prefix. Equal to the friendly label if set,
 * otherwise the generated id. Sanitized so it stays a valid file-name segment.
 */
export async function getDeviceFilePrefix() {
  const device = await getDevice();
  const label = (device.label || device.id).trim();
  return label.replace(/[^A-Za-z0-9._-]+/g, '-');
}

/** Rename the device (friendly label). Pass empty string to clear it. */
export async function setDeviceLabel(label) {
  const device = await getDevice();
  device.label = label ? label.trim() : '';
  await chrome.storage.local.set({ [DEVICE_KEY]: device });
  return device;
}
