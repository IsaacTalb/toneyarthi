CREATE TABLE article_sources (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  article_id TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  source_id TEXT NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
  source_url TEXT NOT NULL UNIQUE,
  source_article_id TEXT,
  fetched_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (article_id, source_id),
  UNIQUE (source_id, source_article_id)
);

CREATE INDEX idx_article_sources_article ON article_sources (article_id);
CREATE INDEX idx_article_sources_source ON article_sources (source_id, fetched_at DESC);
