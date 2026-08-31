-- Playback and size audit fields for generated audio. These are measured from
-- the stored artifact rather than inferred by clients.
ALTER TABLE story_audio_assets ADD COLUMN codec TEXT;
ALTER TABLE story_audio_assets ADD COLUMN bitrate_bps INTEGER CHECK (bitrate_bps > 0);
ALTER TABLE story_audio_assets ADD COLUMN size_warning TEXT
  CHECK (size_warning IS NULL OR size_warning IN ('over_target'));

UPDATE story_audio_assets
SET codec = encoding,
    bitrate_bps = sample_rate * channels * 16,
    size_warning = CASE WHEN byte_size > 2097152 THEN 'over_target' END;
