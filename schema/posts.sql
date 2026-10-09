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
  media_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

-- GET /api/posts lists a user's posts ordered by created_at; this covers
-- both the WHERE and the ORDER BY in one index.
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);
-- publishDuePosts() (app.ts) sweeps WHERE status = 'scheduled' every minute.
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
