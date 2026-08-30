CREATE TABLE story_cluster_articles (
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  similarity_score REAL CHECK (similarity_score BETWEEN 0 AND 1),
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
  added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (cluster_id, article_id),
  UNIQUE (article_id)
);

CREATE INDEX idx_story_cluster_articles_order
  ON story_cluster_articles (cluster_id, is_primary DESC, added_at);
