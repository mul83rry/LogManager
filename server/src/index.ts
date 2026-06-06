import { Hono } from 'hono';
import { cors } from 'hono/cors';

type Env = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  SERVER_BASE_URL: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

// ── JWT (Web Crypto API — available in all Workers runtimes) ──────────────

function toBase64url(data: string | ArrayBuffer): string {
  const str =
    typeof data === 'string'
      ? btoa(data)
      : btoa(String.fromCharCode(...new Uint8Array(data)));
  return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64url(s: string): string {
  return atob(s.replace(/-/g, '+').replace(/_/g, '/'));
}

async function makeJwt(userId: number, email: string, secret: string): Promise<string> {
  const header  = toBase64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now     = Math.floor(Date.now() / 1000);
  const payload = toBase64url(JSON.stringify({ sub: String(userId), email, iat: now, exp: now + 90 * 86400 }));
  const msg     = `${header}.${payload}`;
  const key     = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return `${msg}.${toBase64url(sig)}`;
}

async function verifyJwt(token: string, secret: string): Promise<{ sub: string; email: string } | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'],
    );
    const sig   = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
    if (!valid) return null;
    const p = JSON.parse(fromBase64url(parts[1]));
    if (p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

async function getUserId(c: { req: { header: (k: string) => string | undefined }; env: Env }): Promise<number | null> {
  const auth = c.req.header('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  const p = await verifyJwt(auth.slice(7), c.env.JWT_SECRET);
  if (!p) return null;
  return parseInt(p.sub, 10);
}

// ── Auth: step 1 — extension navigates here, we redirect to Google ────────
app.get('/auth/connect', async (c) => {
  const redirectUri = c.req.query('redirect_uri');
  if (!redirectUri) return c.text('Missing redirect_uri', 400);

  const state     = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await c.env.DB
    .prepare('INSERT INTO oauth_states (state, redirect_uri, expires_at) VALUES (?, ?, ?)')
    .bind(state, redirectUri, expiresAt)
    .run();

  const params = new URLSearchParams({
    client_id:     c.env.GOOGLE_CLIENT_ID,
    redirect_uri:  `${c.env.SERVER_BASE_URL}/auth/callback`,
    response_type: 'code',
    scope:         'openid email profile',
    state,
    prompt:        'select_account',
  });

  return c.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// ── Auth: step 2 — Google redirects here after login ──────────────────────
app.get('/auth/callback', async (c) => {
  const code  = c.req.query('code');
  const state = c.req.query('state');
  const error = c.req.query('error');

  const fail = (msg: string) =>
    c.html(
      `<html><body style="font-family:sans-serif;padding:2rem;background:#0a0a0a;color:#fff">
        <h2>Login failed</h2><p>${msg}</p>
        <p><a href="javascript:window.close()" style="color:#aaa">Close this tab</a></p>
      </body></html>`,
      400,
    );

  if (error || !code || !state) return fail(error ?? 'Missing parameters');

  // clean expired states then look up ours
  await c.env.DB.prepare("DELETE FROM oauth_states WHERE expires_at < datetime('now')").run();
  const row = await c.env.DB
    .prepare('SELECT redirect_uri FROM oauth_states WHERE state = ?')
    .bind(state)
    .first<{ redirect_uri: string }>();

  if (!row) return fail('Session expired — please try again.');
  await c.env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(state).run();

  // exchange code → access_token
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     c.env.GOOGLE_CLIENT_ID,
      client_secret: c.env.GOOGLE_CLIENT_SECRET,
      redirect_uri:  `${c.env.SERVER_BASE_URL}/auth/callback`,
      grant_type:    'authorization_code',
    }),
  });

  if (!tokenRes.ok) return fail(`Google token error: ${await tokenRes.text()}`);
  const { access_token } = await tokenRes.json<{ access_token: string }>();

  // fetch user info
  const infoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const { id: googleId, email, name } = await infoRes.json<{ id: string; email: string; name: string }>();

  // upsert user
  await c.env.DB
    .prepare(`
      INSERT INTO users (google_id, email, name) VALUES (?, ?, ?)
      ON CONFLICT(google_id) DO UPDATE SET email = excluded.email, name = excluded.name
    `)
    .bind(googleId, email, name ?? null)
    .run();

  const user = await c.env.DB
    .prepare('SELECT id FROM users WHERE google_id = ?')
    .bind(googleId)
    .first<{ id: number }>();

  const jwt = await makeJwt(user!.id, email, c.env.JWT_SECRET);
  return c.redirect(`${row.redirect_uri}?token=${encodeURIComponent(jwt)}`);
});

// ── Files API (JWT-protected) ─────────────────────────────────────────────

app.get('/api/files', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const { results } = await c.env.DB
    .prepare('SELECT name FROM week_files WHERE user_id = ?')
    .bind(userId)
    .all<{ name: string }>();
  return c.json(results.map(r => r.name));
});

app.get('/api/files/:name', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const row = await c.env.DB
    .prepare('SELECT content FROM week_files WHERE user_id = ? AND name = ?')
    .bind(userId, c.req.param('name'))
    .first<{ content: string }>();
  if (!row) return c.notFound();
  return new Response(row.content, { headers: { 'Content-Type': 'application/json' } });
});

app.put('/api/files/:name', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  const content = await c.req.text();
  await c.env.DB
    .prepare(`
      INSERT INTO week_files (user_id, name, content, updated_at)
        VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, name)
        DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `)
    .bind(userId, c.req.param('name'), content)
    .run();
  return c.json({ ok: true });
});

app.delete('/api/files/:name', async (c) => {
  const userId = await getUserId(c);
  if (!userId) return c.json({ error: 'Unauthorized' }, 401);
  await c.env.DB
    .prepare('DELETE FROM week_files WHERE user_id = ? AND name = ?')
    .bind(userId, c.req.param('name'))
    .run();
  return c.json({ ok: true });
});

export default app;
