-- Every verifier call is retained, including the initial result before the one
-- permitted correction and the re-verification result after it.
CREATE TABLE story_verifications (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES story_drafts (id) ON DELETE RESTRICT,
  humanization_id TEXT REFERENCES story_humanizations (id) ON DELETE RESTRICT,
  attempt INTEGER NOT NULL CHECK (attempt IN (1, 2)),
  correction_applied INTEGER NOT NULL DEFAULT 0 CHECK (correction_applied IN (0, 1)),
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  passed INTEGER CHECK (passed IN (0, 1)),
  errors TEXT CHECK (errors IS NULL OR (json_valid(errors) AND json_type(errors) = 'array')),
  technical_error TEXT,
  corrected_content TEXT CHECK (corrected_content IS NULL OR (json_valid(corrected_content) AND json_type(corrected_content) = 'object')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (cluster_id, draft_id, attempt),
  CHECK ((technical_error IS NULL AND passed IS NOT NULL AND errors IS NOT NULL) OR
         (technical_error IS NOT NULL AND passed IS NULL AND errors IS NULL))
);
CREATE INDEX idx_story_verifications_cluster
  ON story_verifications (cluster_id, created_at DESC);

-- SQLite requires rebuilding the table to widen its state constraint.
PRAGMA foreign_keys = OFF;
CREATE TABLE story_clusters_new (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  cluster_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'archived')),
  first_published_at TEXT, last_published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  pipeline_state TEXT NOT NULL DEFAULT 'EXTRACTING'
    CHECK (pipeline_state IN ('EXTRACTING','WRITING','READY_FOR_REVIEW','VERIFYING','TTS_PENDING','NEEDS_REVIEW','FAILED_VERIFICATION','PUBLISHED'))
);
INSERT INTO story_clusters_new SELECT * FROM story_clusters;
DROP TABLE story_clusters;
ALTER TABLE story_clusters_new RENAME TO story_clusters;
CREATE INDEX idx_story_clusters_feed ON story_clusters (category_id, status, last_published_at DESC);
CREATE INDEX idx_story_clusters_status ON story_clusters (status, updated_at);
PRAGMA foreign_keys = ON;
