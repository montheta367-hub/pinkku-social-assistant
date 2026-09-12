-- Telegram groups a user has linked for deadline/task detection (e.g. a
-- university group or project team chat) — separate from telegram_contacts
-- (1:1 customer DMs) so group chatter never lands in Customer DMs or
-- triggers auto-reply; it only feeds AI Smart Schedule.
CREATE TABLE IF NOT EXISTS telegram_groups (
  chat_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  group_name TEXT,
  created_at TEXT NOT NULL
);
