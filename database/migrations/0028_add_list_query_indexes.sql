-- Match the equality predicates and complete ordering used by public feeds.
-- Including id as the final descending key keeps equal timestamps stable.
CREATE INDEX idx_articles_publication_page
  ON articles (status, published_at DESC, id DESC);
CREATE INDEX idx_articles_category_page
  ON articles (category_id, status, published_at DESC, id DESC);
CREATE INDEX idx_articles_audio_page
  ON articles (status, published_at DESC, id DESC)
  WHERE audio_url IS NOT NULL;

CREATE INDEX idx_playlists_publication_page
  ON playlists (status, published_at DESC, id DESC);

-- Admin lists sort independently of is_active/status.
CREATE INDEX idx_playlists_updated ON playlists (updated_at DESC, id);
CREATE INDEX idx_processing_jobs_created
  ON processing_jobs (created_at DESC, id);
