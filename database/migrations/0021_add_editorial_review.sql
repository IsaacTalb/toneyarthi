-- Publication is always an explicit editorial decision. `manual` is the
-- database default so adding this migration cannot enable automatic publishing.
ALTER TABLE story_clusters ADD COLUMN reviewed_at TEXT;
ALTER TABLE story_clusters ADD COLUMN reviewed_by TEXT;
ALTER TABLE story_clusters ADD COLUMN publish_mode TEXT NOT NULL DEFAULT 'manual'
  CHECK (publish_mode IN ('manual', 'automatic'));
ALTER TABLE story_clusters ADD COLUMN published_at TEXT;

CREATE TABLE editorial_audit_records (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  action TEXT NOT NULL CHECK (action IN ('publish', 'unpublish', 'reject', 'regenerate_article', 'regenerate_audio')),
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}'
    CHECK (json_valid(details) AND json_type(details) = 'object'),
  idempotency_key TEXT NOT NULL UNIQUE CHECK (length(trim(idempotency_key)) > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_editorial_audit_cluster
  ON editorial_audit_records (cluster_id, created_at DESC);
