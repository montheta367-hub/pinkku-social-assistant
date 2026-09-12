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
