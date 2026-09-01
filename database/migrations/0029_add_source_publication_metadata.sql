ALTER TABLE article_sources ADD COLUMN original_title TEXT;
ALTER TABLE article_sources ADD COLUMN original_published_at TEXT;

CREATE INDEX idx_article_sources_original_publication
  ON article_sources (original_published_at);
