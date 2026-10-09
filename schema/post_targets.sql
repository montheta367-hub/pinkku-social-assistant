-- Per-platform publish outcome for a post. A post targeting Facebook +
-- Instagram gets one row per platform here once publishPostNow (app.ts)
-- runs, so "Facebook succeeded, Instagram failed" is tracked individually
-- instead of collapsing into the single posts.status column.
CREATE TABLE IF NOT EXISTS post_targets (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | published | failed
  external_post_id TEXT,
  error_message TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (post_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_post_targets_post ON post_targets(post_id);
CREATE INDEX IF NOT EXISTS idx_post_targets_user ON post_targets(user_id);
