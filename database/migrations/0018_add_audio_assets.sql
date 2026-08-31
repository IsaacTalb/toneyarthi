-- Validated, immutable TTS artifacts and explicit terminal audio states.
-- Widen processing and pipeline state constraints without discarding diagnostics.
PRAGMA foreign_keys = OFF;
CREATE TABLE processing_jobs_new (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  article_id TEXT REFERENCES articles (id) ON DELETE CASCADE,
  cluster_id TEXT REFERENCES story_clusters (id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('ingest','translate','summarize','cluster','audio','extract','write')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled','FAILED_AI','FAILED_TTS')),
  payload TEXT NOT NULL DEFAULT '{}', result TEXT, error_message TEXT,
  deduplication_key TEXT UNIQUE, priority INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
  available_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  started_at TEXT, completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (attempts <= max_attempts)
);
INSERT INTO processing_jobs_new SELECT * FROM processing_jobs;
DROP TABLE processing_jobs;
ALTER TABLE processing_jobs_new RENAME TO processing_jobs;
CREATE INDEX idx_processing_jobs_queue ON processing_jobs (status, available_at, priority DESC, created_at);
CREATE INDEX idx_processing_jobs_article ON processing_jobs (article_id, job_type, status);
CREATE INDEX idx_processing_jobs_cluster ON processing_jobs (cluster_id, job_type, status);

CREATE TABLE story_clusters_new (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  title TEXT NOT NULL, summary TEXT, cluster_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','merged','archived')),
  first_published_at TEXT, last_published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  pipeline_state TEXT NOT NULL DEFAULT 'EXTRACTING'
    CHECK (pipeline_state IN ('EXTRACTING','WRITING','READY_FOR_REVIEW','VERIFYING','TTS_PENDING','READY','NEEDS_REVIEW','FAILED_VERIFICATION','FAILED_TTS','PUBLISHED'))
);
INSERT INTO story_clusters_new SELECT * FROM story_clusters;
DROP TABLE story_clusters;
ALTER TABLE story_clusters_new RENAME TO story_clusters;
CREATE INDEX idx_story_clusters_feed ON story_clusters (category_id, status, last_published_at DESC);
CREATE INDEX idx_story_clusters_status ON story_clusters (status, updated_at);
CREATE TABLE story_audio_assets (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  audio_script_id TEXT NOT NULL UNIQUE REFERENCES story_audio_scripts (id) ON DELETE RESTRICT,
  job_id TEXT NOT NULL REFERENCES processing_jobs (id) ON DELETE RESTRICT,
  audio_key TEXT NOT NULL UNIQUE,
  duration_seconds REAL NOT NULL CHECK (duration_seconds > 0),
  byte_size INTEGER NOT NULL CHECK (byte_size > 44),
  ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1)),
  mime_type TEXT NOT NULL,
  encoding TEXT NOT NULL,
  sample_rate INTEGER NOT NULL CHECK (sample_rate > 0),
  channels INTEGER NOT NULL CHECK (channels > 0),
  model TEXT NOT NULL,
  narrator TEXT,
  generated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_story_audio_assets_cluster ON story_audio_assets (cluster_id, generated_at DESC);


-- Rebuild the verified-script guard dropped along with processing_jobs.
CREATE TRIGGER require_verified_audio_script_before_tts
BEFORE INSERT ON processing_jobs
WHEN NEW.job_type = 'audio' AND NEW.cluster_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM story_audio_scripts audio
    JOIN story_audio_script_verifications verification
      ON verification.audio_script_id = audio.id
    WHERE audio.id = json_extract(NEW.payload, '$.audioScriptId')
      AND audio.cluster_id = NEW.cluster_id AND verification.passed = 1
  ) THEN RAISE(ABORT, 'audio script must pass fidelity verification before TTS queueing') END;
END;

PRAGMA foreign_keys = ON;
