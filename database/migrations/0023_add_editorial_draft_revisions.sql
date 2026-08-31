-- Editors never overwrite generated copy. Each save is retained with its actor,
-- timestamp, and the exact list of fields changed.
CREATE TABLE editorial_draft_revisions (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  title_mm TEXT NOT NULL CHECK (length(trim(title_mm)) BETWEEN 1 AND 180),
  summary_mm TEXT NOT NULL CHECK (length(trim(summary_mm)) BETWEEN 1 AND 600),
  content_mm TEXT NOT NULL CHECK (length(trim(content_mm)) BETWEEN 1 AND 20000),
  audio_script_mm TEXT NOT NULL CHECK (length(trim(audio_script_mm)) BETWEEN 1 AND 12000),
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  changed_fields TEXT NOT NULL CHECK (json_valid(changed_fields) AND json_type(changed_fields) = 'array'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_editorial_revisions_cluster
  ON editorial_draft_revisions (cluster_id, created_at DESC);

-- Widen the audit vocabulary while preserving the complete existing history.
PRAGMA foreign_keys = OFF;
CREATE TABLE editorial_audit_records_new (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  action TEXT NOT NULL CHECK (action IN ('publish','unpublish','reject','regenerate_article','rehumanize','regenerate_audio','save_draft')),
  from_state TEXT NOT NULL, to_state TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details) AND json_type(details) = 'object'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO editorial_audit_records_new SELECT * FROM editorial_audit_records;
DROP TABLE editorial_audit_records;
ALTER TABLE editorial_audit_records_new RENAME TO editorial_audit_records;
CREATE INDEX idx_editorial_audit_cluster ON editorial_audit_records (cluster_id, created_at DESC);
PRAGMA foreign_keys = ON;
