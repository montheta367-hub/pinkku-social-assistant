CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT
);

-- Migration for an existing sessions table (safe to re-run). Sessions created
-- before this column existed have expires_at = NULL and are treated as
-- still-valid until the user logs out; only newly-created sessions expire.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TEXT;
