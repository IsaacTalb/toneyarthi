-- Cluster membership retains every article (and therefore every article_sources
-- URL) rather than collapsing source records into a single article.
ALTER TABLE story_cluster_articles ADD COLUMN match_decision TEXT NOT NULL DEFAULT 'high-confidence'
  CHECK (match_decision IN ('high-confidence'));
ALTER TABLE story_cluster_articles ADD COLUMN match_explanation TEXT;

-- Ambiguous comparisons are deliberately outside story_cluster_articles: they
-- are review candidates, not cluster membership.
CREATE TABLE story_cluster_candidates (
  cluster_id TEXT NOT NULL REFERENCES story_clusters (id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  similarity_score REAL NOT NULL CHECK (similarity_score BETWEEN 0 AND 1),
  match_explanation TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  reviewed_at TEXT,
  PRIMARY KEY (cluster_id, article_id)
);

CREATE INDEX idx_story_cluster_candidates_review
  ON story_cluster_candidates (status, similarity_score DESC, created_at);
