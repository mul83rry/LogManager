// ServerProvider — stores week files on a dedicated ASP.NET Core server.
//
// Auth uses Google OAuth routed through the server:
//   1. Extension opens {serverUrl}/auth/connect?redirect_uri=<extensionRedirectUrl>
//   2. Server redirects to Google, receives the auth code, issues a JWT.
//   3. Server redirects back to the extension redirect URI with ?token=<jwt>.
//   4. Extension stores the JWT and uses it as a Bearer token for all API calls.

const TOKEN_KEY = 'serverToken';

export class ServerProvider {
  constructor(settings) {
    this.id = 'server';
    this.serverUrl = (settings.serverUrl || '').replace(/\/$/, '');
  }

  async isConnected() {
    return Boolean(await this.#getToken());
  }

  async connect() {
    if (!this.serverUrl) {
      throw new Error('Server URL is not configured (see options).');
    }
    const redirectUri = chrome.identity.getRedirectURL();
    const connectUrl =
      `${this.serverUrl}/auth/connect?` +
      new URLSearchParams({ redirect_uri: redirectUri }).toString();

    const result = await chrome.identity.launchWebAuthFlow({
      url: connectUrl,
      interactive: true,
    });

    const token = new URL(result).searchParams.get('token');
    if (!token) throw new Error('Login was cancelled or failed.');
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
  }

  async disconnect() {
    await chrome.storage.local.remove(TOKEN_KEY);
  }

  async list() {
    const res = await this.#req('GET', '/api/files');
    return res.json();
  }

  async read(name) {
    const token = await this.#getToken();
    if (!token) throw new Error('Not connected to server.');
    const res = await fetch(
      `${this.serverUrl}/api/files/${encodeURIComponent(name)}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`Server read failed (${res.status})`);
    return res.text();
  }

  async write(name, contents) {
    const token = await this.#getToken();
    if (!token) throw new Error('Not connected to server.');
    const res = await fetch(
      `${this.serverUrl}/api/files/${encodeURIComponent(name)}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: contents,
      },
    );
    if (!res.ok) throw new Error(`Server write failed (${res.status})`);
  }

  async remove(name) {
    const token = await this.#getToken();
    if (!token) throw new Error('Not connected to server.');
    const res = await fetch(
      `${this.serverUrl}/api/files/${encodeURIComponent(name)}`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404) throw new Error(`Server delete failed (${res.status})`);
  }

  // --- internals -------------------------------------------------------------

  async #req(method, path) {
    const token = await this.#getToken();
    if (!token) throw new Error('Not connected to server.');
    const res = await fetch(`${this.serverUrl}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) {
      await chrome.storage.local.remove(TOKEN_KEY);
      throw new Error('Session expired. Please reconnect.');
    }
    if (!res.ok) throw new Error(`Server request failed (${res.status})`);
    return res;
  }

  async #getToken() {
    const { [TOKEN_KEY]: token } = await chrome.storage.local.get(TOKEN_KEY);
    return token || null;
  }
}
