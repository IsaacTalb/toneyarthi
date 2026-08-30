-- Humanization is separately versioned from writing. The source draft remains
-- immutable for audit, while this table stores the constrained stylistic edit.
CREATE TABLE story_humanizations (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  job_id TEXT NOT NULL UNIQUE REFERENCES processing_jobs (id) ON DELETE CASCADE,
  draft_id TEXT NOT NULL REFERENCES story_drafts (id) ON DELETE RESTRICT,
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  title_mm TEXT NOT NULL CHECK (length(trim(title_mm)) > 0),
  summary_mm TEXT NOT NULL CHECK (length(trim(summary_mm)) > 0),
  content_mm TEXT NOT NULL CHECK (length(trim(content_mm)) > 0),
  immutable_input TEXT NOT NULL,
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_story_humanizations_cluster
  ON story_humanizations (cluster_id, generated_at DESC);
