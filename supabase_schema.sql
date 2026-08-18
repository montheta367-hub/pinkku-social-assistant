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
