-- Real inbound customer messages (currently: Telegram), shown in Customer DMs.
CREATE TABLE IF NOT EXISTS customer_messages (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  external_chat_id TEXT,
  customer_name TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread',
  reply_text TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- Migration for an existing customer_messages table (safe to re-run).
ALTER TABLE customer_messages ADD COLUMN IF NOT EXISTS reply_text TEXT;
