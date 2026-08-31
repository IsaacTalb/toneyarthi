ALTER TABLE sources ADD COLUMN adapter_type TEXT NOT NULL DEFAULT 'rss'
  CHECK (adapter_type IN ('rss'));
ALTER TABLE sources ADD COLUMN last_success_at TEXT;
ALTER TABLE sources ADD COLUMN last_error TEXT CHECK (length(last_error) <= 1000);

CREATE TABLE source_admin_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE RESTRICT,
  source_slug TEXT NOT NULL,
  actor TEXT NOT NULL,
  changes TEXT NOT NULL CHECK (json_valid(changes)),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_source_admin_audit_source ON source_admin_audit(source_id, created_at DESC);
