CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id  TEXT UNIQUE NOT NULL,
  email      TEXT NOT NULL,
  name       TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS week_files (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id),
  name       TEXT NOT NULL,
  content    TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state        TEXT PRIMARY KEY,
  redirect_uri TEXT NOT NULL,
  expires_at   TEXT NOT NULL
);
