ALTER TABLE playlists ADD COLUMN is_active INTEGER NOT NULL DEFAULT 0
  CHECK (is_active IN (0, 1));
ALTER TABLE playlists ADD COLUMN schedule_type TEXT NOT NULL DEFAULT 'manual'
  CHECK (schedule_type IN ('manual', 'daily', 'weekly'));

CREATE INDEX idx_playlists_admin ON playlists (is_active, updated_at DESC);
