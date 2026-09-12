CREATE TABLE IF NOT EXISTS connected_accounts (
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  account_email TEXT,
  account_name TEXT,
  avatar TEXT,
  external_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  connected_at TEXT NOT NULL,
  PRIMARY KEY (user_id, platform)
);
