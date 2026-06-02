// OneDriveProvider — stores week files in the OneDrive App Folder
// (`/Apps/EdgeTimeTracker/`, surfaced by Graph as `special/approot`).
//
// Auth uses the Microsoft identity platform v2.0 authorization-code flow with
// PKCE (no client secret — this is a public client) driven through
// chrome.identity.launchWebAuthFlow. The user must register an app in Azure,
// add this extension's redirect URL (chrome.identity.getRedirectURL()) as a
// SPA/native redirect, and paste the resulting client id into the options page.
//
// Scopes: Files.ReadWrite.AppFolder (per-app sandboxed folder) + offline_access
// for refresh tokens.

const AUTHORITY = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'Files.ReadWrite.AppFolder offline_access openid profile';
const TOKEN_KEY = 'onedriveToken';

export class OneDriveProvider {
  constructor(settings) {
    this.id = 'onedrive';
    this.clientId = settings.oneDriveClientId;
  }

  async isConnected() {
    const token = await this.#getStoredToken();
    return Boolean(token && token.refresh_token);
  }

  async connect() {
    if (!this.clientId) {
      throw new Error('OneDrive client id is not configured (see options).');
    }
    const redirectUri = chrome.identity.getRedirectURL();
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(await sha256(verifier));

    const buildUrl = (prompt) =>
      `${AUTHORITY}/authorize?` +
      new URLSearchParams({
        client_id: this.clientId,
        response_type: 'code',
        redirect_uri: redirectUri,
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt,
      }).toString();

    // 1. Try silent auth — picks up the Edge/Windows signed-in Microsoft account
    //    session with no UI if the user is already authenticated.
    let redirectResponse;
    try {
      redirectResponse = await chrome.identity.launchWebAuthFlow({
        url: buildUrl('none'),
        interactive: false,
      });
    } catch {
      // Silent attempt failed (no active session or consent needed).
      // Fall back to the full interactive login dialog.
      redirectResponse = await chrome.identity.launchWebAuthFlow({
        url: buildUrl('select_account'),
        interactive: true,
      });
    }

    const code = new URL(redirectResponse).searchParams.get('code');
    if (!code) throw new Error('OneDrive authorization was cancelled.');

    const token = await this.#exchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    });
    await this.#storeToken(token);
  }

  async disconnect() {
    await chrome.storage.local.remove(TOKEN_KEY);
  }

  async list() {
    const names = [];
    let url = `${GRAPH}/me/drive/special/approot/children?$select=name&$top=200`;
    while (url) {
      const data = await this.#graph(url);
      for (const item of data.value || []) {
        if (item.name) names.push(item.name);
      }
      url = data['@odata.nextLink'] || null;
    }
    return names;
  }

  async read(name) {
    const token = await this.#accessToken();
    const res = await fetch(`${GRAPH}/me/drive/special/approot:/${encodeURIComponent(name)}:/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`OneDrive read failed (${res.status})`);
    return res.text();
  }

  async write(name, contents) {
    const token = await this.#accessToken();
    const res = await fetch(`${GRAPH}/me/drive/special/approot:/${encodeURIComponent(name)}:/content`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: contents,
    });
    if (!res.ok) throw new Error(`OneDrive write failed (${res.status})`);
  }

  async remove(name) {
    const token = await this.#accessToken();
    const res = await fetch(`${GRAPH}/me/drive/special/approot:/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404) throw new Error(`OneDrive delete failed (${res.status})`);
  }

  // --- internals -----------------------------------------------------------

  async #graph(url) {
    const token = await this.#accessToken();
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`OneDrive request failed (${res.status})`);
    return res.json();
  }

  /** Return a valid access token, refreshing it if expired. */
  async #accessToken() {
    let token = await this.#getStoredToken();
    if (!token) throw new Error('Not connected to OneDrive.');
    if (Date.now() >= token.expires_at - 60_000) {
      token = await this.#exchange({
        grant_type: 'refresh_token',
        refresh_token: token.refresh_token,
      });
      await this.#storeToken(token);
    }
    return token.access_token;
  }

  async #exchange(params) {
    const body = new URLSearchParams({
      client_id: this.clientId,
      scope: SCOPES,
      ...params,
    });
    const res = await fetch(`${AUTHORITY}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OneDrive token exchange failed (${res.status}): ${detail}`);
    }
    return res.json();
  }

  async #storeToken(raw) {
    const existing = await this.#getStoredToken();
    const token = {
      access_token: raw.access_token,
      // Microsoft only returns a new refresh token sometimes; keep the old one.
      refresh_token: raw.refresh_token || existing?.refresh_token,
      expires_at: Date.now() + (raw.expires_in || 3600) * 1000,
    };
    await chrome.storage.local.set({ [TOKEN_KEY]: token });
  }

  async #getStoredToken() {
    const { [TOKEN_KEY]: token } = await chrome.storage.local.get(TOKEN_KEY);
    return token || null;
  }
}

// --- PKCE helpers ------------------------------------------------------------

function base64url(bytes) {
  let str = '';
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  return crypto.subtle.digest('SHA-256', data);
}
