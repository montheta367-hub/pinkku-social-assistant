-- Pinkku schema for Supabase (Postgres). Run once in the Supabase SQL Editor.
-- Mirrors the previous local SQLite schema in server.ts exactly.

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

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS oauth_states (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  extra TEXT,
  created_at TEXT NOT NULL
);

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

-- AI Smart Schedule: manually-added events, plus a persisted snapshot of any
-- Gmail-detected event the user has added to their schedule (so it survives
-- refresh/logout even if that email later falls out of the AI detection scan).
CREATE TABLE IF NOT EXISTS schedule_events (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  importance TEXT NOT NULL DEFAULT 'normal',
  source_subject TEXT,
  manual BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

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

-- Per-user toggle: when enabled, incoming Telegram customer messages get an
-- AI-drafted reply sent automatically instead of waiting for manual review.
ALTER TABLE users ADD COLUMN IF NOT EXISTS telegram_auto_reply BOOLEAN NOT NULL DEFAULT FALSE;

-- Same idea, for incoming Facebook Messenger DMs to a connected Page.
ALTER TABLE users ADD COLUMN IF NOT EXISTS facebook_auto_reply BOOLEAN NOT NULL DEFAULT FALSE;

-- Social posts, including the solo-review workflow: draft -> pending_review ->
-- scheduled -> published. platforms/tags are stored as JSON-encoded text
-- arrays to match this codebase's existing simple-column style.
CREATE TABLE IF NOT EXISTS posts (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  myanmar_content TEXT,
  platforms TEXT NOT NULL,
  scheduled_date TEXT,
  scheduled_time TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  tone TEXT,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);
