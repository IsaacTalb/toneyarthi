ALTER TABLE sources ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_sources_ingest_priority
  ON sources (is_active, priority DESC, slug);
