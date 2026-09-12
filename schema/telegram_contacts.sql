-- Maps a Telegram chat to the Pinkku business it belongs to. The shared bot
-- serves every business, so each business shares its own permanent
-- "biz_<user id>" deep link with customers; a customer's first /start with
-- that code registers this row, and every message after that routes here.
CREATE TABLE IF NOT EXISTS telegram_contacts (
  chat_id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  customer_name TEXT,
  created_at TEXT NOT NULL
);
