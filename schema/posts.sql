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
