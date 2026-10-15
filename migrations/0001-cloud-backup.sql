CREATE TABLE IF NOT EXISTS cloud_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES cloud_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_sessions_expiry ON cloud_sessions(expires_at);
CREATE TABLE IF NOT EXISTS cloud_backups (
  user_id TEXT PRIMARY KEY REFERENCES cloud_users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  revision TEXT NOT NULL,
  saved_at INTEGER NOT NULL,
  bytes INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cloud_limits_expiry ON cloud_rate_limits(expires_at);
