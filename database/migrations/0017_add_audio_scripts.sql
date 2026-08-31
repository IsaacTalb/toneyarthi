-- Speech copy is immutable and separate from display copy. A second model pass
-- must approve all fidelity dimensions before a cluster audio job can exist.
CREATE TABLE story_audio_scripts (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  source_verification_id TEXT NOT NULL REFERENCES story_verifications (id) ON DELETE RESTRICT,
  audio_script_mm TEXT NOT NULL CHECK (length(trim(audio_script_mm)) > 0),
  pronunciation_dictionary TEXT NOT NULL CHECK (json_valid(pronunciation_dictionary) AND json_type(pronunciation_dictionary) = 'object'),
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_story_audio_scripts_cluster
  ON story_audio_scripts (cluster_id, created_at DESC);

CREATE TABLE story_audio_script_verifications (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  audio_script_id TEXT NOT NULL UNIQUE REFERENCES story_audio_scripts (id) ON DELETE CASCADE,
  passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
  checks TEXT NOT NULL CHECK (json_valid(checks) AND json_type(checks) = 'object'),
  errors TEXT NOT NULL CHECK (json_valid(errors) AND json_type(errors) = 'array'),
  prompt_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (passed = 0 OR json_array_length(errors) = 0),
  CHECK (passed = 0 OR
    json_extract(checks, '$.names') = 1 AND
    json_extract(checks, '$.dates') = 1 AND
    json_extract(checks, '$.numbers') = 1 AND
    json_extract(checks, '$.attribution') = 1 AND
    json_extract(checks, '$.uncertainty') = 1)
);

-- Cluster-scoped audio jobs are the TTS hand-off. Abort the hand-off unless
-- payload.audioScriptId identifies a successfully re-checked script.
CREATE TRIGGER require_verified_audio_script_before_tts
BEFORE INSERT ON processing_jobs
WHEN NEW.job_type = 'audio' AND NEW.cluster_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
      FROM story_audio_scripts audio
      JOIN story_audio_script_verifications verification
        ON verification.audio_script_id = audio.id
     WHERE audio.id = json_extract(NEW.payload, '$.audioScriptId')
       AND audio.cluster_id = NEW.cluster_id
       AND verification.passed = 1
  ) THEN RAISE(ABORT, 'audio script must pass fidelity verification before TTS queueing') END;
END;
