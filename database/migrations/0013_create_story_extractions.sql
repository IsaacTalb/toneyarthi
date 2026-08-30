-- SQLite cannot widen CHECK constraints, so preserve the jobs while adding the
-- cluster extraction job type and its explicit terminal AI failure state.
PRAGMA foreign_keys = OFF;

CREATE TABLE processing_jobs_new (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  article_id TEXT REFERENCES articles (id) ON DELETE CASCADE,
  cluster_id TEXT REFERENCES story_clusters (id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('ingest', 'translate', 'summarize', 'cluster', 'audio', 'extract')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'FAILED_AI')),
  payload TEXT NOT NULL DEFAULT '{}', result TEXT, error_message TEXT,
  deduplication_key TEXT UNIQUE, priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT, completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (attempts <= max_attempts),
  CHECK ((job_type = 'extract' AND cluster_id IS NOT NULL) OR job_type <> 'extract')
);

INSERT INTO processing_jobs_new (id, article_id, job_type, status, payload, result, error_message, deduplication_key, priority, attempts, max_attempts, available_at, started_at, completed_at, created_at, updated_at)
SELECT id, article_id, job_type, status, payload, result, error_message, deduplication_key, priority, attempts, max_attempts, available_at, started_at, completed_at, created_at, updated_at FROM processing_jobs;
DROP TABLE processing_jobs;
ALTER TABLE processing_jobs_new RENAME TO processing_jobs;
CREATE INDEX idx_processing_jobs_queue ON processing_jobs (status, available_at, priority DESC, created_at);
CREATE INDEX idx_processing_jobs_article ON processing_jobs (article_id, job_type, status);
CREATE INDEX idx_processing_jobs_cluster ON processing_jobs (cluster_id, job_type, status);

CREATE TABLE story_extractions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  job_id TEXT NOT NULL UNIQUE REFERENCES processing_jobs (id) ON DELETE CASCADE,
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  output TEXT NOT NULL CHECK (json_valid(output) AND json_type(output) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_story_extractions_cluster ON story_extractions (cluster_id, created_at DESC);

PRAGMA foreign_keys = ON;
