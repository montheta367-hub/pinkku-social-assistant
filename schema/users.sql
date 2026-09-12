CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  business_name TEXT,
  business_type TEXT,
  avatar TEXT,
  tier TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);

-- Per-user toggle: when enabled, incoming Telegram customer messages get an
-- AI-drafted reply sent automatically instead of waiting for manual review.
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_auto_reply BOOLEAN NOT NULL DEFAULT FALSE;

-- Same idea, for incoming Facebook Messenger DMs to a connected Page.
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_auto_reply BOOLEAN NOT NULL DEFAULT FALSE;
