// LocalProvider — the default, zero-configuration "cloud".
//
// It stores week files inside chrome.storage.local under a `cloud:` namespace,
// faithfully simulating a flat folder of named JSON files. This makes the whole
// extension fully functional offline and on first install, and is what the
// sharded-file logic is exercised against in day-to-day use. Switching to
// OneDrive later does not touch any code above the provider layer.

const NAMESPACE = 'cloud:';

export class LocalProvider {
  constructor() {
    this.id = 'local';
  }

  async isConnected() {
    return true; // local storage is always available
  }

  async connect() {
    /* no-op: nothing to authenticate */
  }

  async disconnect() {
    /* no-op */
  }

  async list() {
    const all = await chrome.storage.local.get(null);
    return Object.keys(all)
      .filter((k) => k.startsWith(NAMESPACE))
      .map((k) => k.slice(NAMESPACE.length));
  }

  async read(name) {
    const key = NAMESPACE + name;
    const result = await chrome.storage.local.get(key);
    return result[key] ?? null;
  }

  async write(name, contents) {
    await chrome.storage.local.set({ [NAMESPACE + name]: contents });
  }

  async remove(name) {
    await chrome.storage.local.remove(NAMESPACE + name);
  }
}
