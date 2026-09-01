-- Risk is explicit, queryable, and defaults conservatively for existing stories.
ALTER TABLE story_clusters ADD COLUMN editorial_risk TEXT NOT NULL DEFAULT 'standard'
  CHECK (editorial_risk IN ('standard', 'high'));
ALTER TABLE story_clusters ADD COLUMN editorial_confidence TEXT NOT NULL DEFAULT 'low'
  CHECK (editorial_confidence IN ('high', 'medium', 'low'));
ALTER TABLE story_clusters ADD COLUMN risk_topics TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(risk_topics) AND json_type(risk_topics) = 'array');
ALTER TABLE story_clusters ADD COLUMN risk_reasons TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(risk_reasons) AND json_type(risk_reasons) = 'array');

CREATE INDEX idx_story_clusters_editorial_risk
  ON story_clusters (editorial_risk, editorial_confidence, pipeline_state);
