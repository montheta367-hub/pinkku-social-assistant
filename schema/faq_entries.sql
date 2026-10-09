-- Up to ~6 canned Q&A pairs a business pre-writes (mirrors a Facebook Page's
-- native "Frequently Asked Questions" automation). A matching incoming
-- customer message gets this answer directly instead of a Gemini call — see
-- findFaqMatch in app.ts.
CREATE TABLE IF NOT EXISTS faq_entries (
  id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  question TEXT NOT NULL,
  keywords TEXT, -- comma-separated trigger phrases; matches against `question` itself when left blank
  answer TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE INDEX IF NOT EXISTS idx_faq_entries_user ON faq_entries(user_id);
