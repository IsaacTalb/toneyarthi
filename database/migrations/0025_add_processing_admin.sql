-- Operational retries are recorded separately from editorial decisions.
CREATE TABLE processing_job_audit (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  job_id TEXT NOT NULL REFERENCES processing_jobs (id) ON DELETE CASCADE,
  retried_from_job_id TEXT REFERENCES processing_jobs (id) ON DELETE SET NULL,
  actor TEXT NOT NULL CHECK (length(trim(actor)) > 0),
  action TEXT NOT NULL CHECK (action = 'retry'),
  details TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(details) AND json_type(details) = 'object'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_processing_job_audit_job ON processing_job_audit(job_id, created_at DESC);

-- This database guard closes the race between two administrators retrying the
-- same subject/type. Historical duplicates do not prevent the migration.
CREATE TRIGGER processing_jobs_prevent_duplicate_active
BEFORE INSERT ON processing_jobs
WHEN NEW.status IN ('pending', 'processing') AND EXISTS (
  SELECT 1 FROM processing_jobs existing
  WHERE existing.job_type = NEW.job_type
    AND existing.status IN ('pending', 'processing')
    AND COALESCE(existing.cluster_id, '') = COALESCE(NEW.cluster_id, '')
    AND COALESCE(existing.article_id, '') = COALESCE(NEW.article_id, '')
)
BEGIN
  SELECT RAISE(ABORT, 'duplicate active processing job');
END;
