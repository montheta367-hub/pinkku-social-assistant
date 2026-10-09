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

-- Incoming Facebook/Telegram webhooks look up the owning account by
-- (platform, external_id) — e.g. a Messenger event's Page id — not by the
-- (user_id, platform) primary key, which doesn't help that lookup.
CREATE INDEX IF NOT EXISTS idx_connected_accounts_platform_external ON connected_accounts(platform, external_id);
