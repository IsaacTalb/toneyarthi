CREATE TABLE playlist_articles (
  playlist_id TEXT NOT NULL REFERENCES playlists (id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (playlist_id, article_id),
  UNIQUE (playlist_id, position)
);

CREATE INDEX idx_playlist_articles_order ON playlist_articles (playlist_id, position);
CREATE INDEX idx_playlist_articles_article ON playlist_articles (article_id);
