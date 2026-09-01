-- Briefing generation is auditable and idempotent. Editors can lock a playlist
-- (or mark it as a manual override) so scheduled runs cannot replace their work.
ALTER TABLE playlists ADD COLUMN briefing_period TEXT
  CHECK (briefing_period IS NULL OR briefing_period IN ('morning', 'evening'));
ALTER TABLE playlists ADD COLUMN generation_key TEXT;
ALTER TABLE playlists ADD COLUMN generated_at TEXT;
ALTER TABLE playlists ADD COLUMN editor_locked_at TEXT;
ALTER TABLE playlists ADD COLUMN manual_override INTEGER NOT NULL DEFAULT 0
  CHECK (manual_override IN (0, 1));

ALTER TABLE playlist_articles ADD COLUMN selection_reason TEXT
  CHECK (selection_reason IS NULL OR json_valid(selection_reason));

CREATE TABLE briefing_generation_events (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  generation_key TEXT NOT NULL UNIQUE,
  period TEXT NOT NULL CHECK (period IN ('morning', 'evening')),
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'skipped_locked', 'failed')),
  config TEXT NOT NULL CHECK (json_valid(config) AND json_type(config) = 'object'),
  playlist_id TEXT REFERENCES playlists(id) ON DELETE SET NULL,
  candidate_count INTEGER,
  selected_count INTEGER,
  error_message TEXT CHECK (error_message IS NULL OR length(error_message) <= 1000),
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_briefing_events_status
  ON briefing_generation_events (status, started_at DESC);
CREATE INDEX idx_playlists_briefing
  ON playlists (briefing_period, generated_at DESC);
CREATE UNIQUE INDEX idx_playlists_generation_key
  ON playlists (generation_key) WHERE generation_key IS NOT NULL;
