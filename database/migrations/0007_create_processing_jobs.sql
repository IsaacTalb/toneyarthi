CREATE TABLE processing_jobs (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  article_id TEXT REFERENCES articles (id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('ingest', 'translate', 'summarize', 'cluster', 'audio')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  payload TEXT NOT NULL DEFAULT '{}',
  result TEXT,
  error_message TEXT,
  deduplication_key TEXT UNIQUE,
  priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (attempts <= max_attempts)
);

CREATE INDEX idx_processing_jobs_queue
  ON processing_jobs (status, available_at, priority DESC, created_at);
CREATE INDEX idx_processing_jobs_article ON processing_jobs (article_id, job_type, status);
