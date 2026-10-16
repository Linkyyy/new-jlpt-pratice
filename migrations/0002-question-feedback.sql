CREATE TABLE IF NOT EXISTS question_feedback (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  level TEXT NOT NULL,
  period TEXT NOT NULL,
  category TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('original', 'imported')),
  question_number INTEGER,
  issue_type TEXT NOT NULL CHECK(issue_type IN ('answer', 'text', 'image', 'audio', 'other')),
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'reviewing', 'resolved')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS question_feedback_recent ON question_feedback(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS question_feedback_status_recent ON question_feedback(status, created_at DESC, id DESC);
