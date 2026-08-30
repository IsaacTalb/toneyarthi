CREATE TABLE story_clusters (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  summary TEXT,
  cluster_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'merged', 'archived')),
  first_published_at TEXT,
  last_published_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_story_clusters_feed
  ON story_clusters (category_id, status, last_published_at DESC);
CREATE INDEX idx_story_clusters_status ON story_clusters (status, updated_at);
