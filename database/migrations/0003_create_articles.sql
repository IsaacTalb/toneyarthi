CREATE TABLE articles (
  id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  title_my TEXT,
  summary TEXT,
  summary_my TEXT,
  body TEXT,
  body_my TEXT,
  author TEXT,
  image_url TEXT,
  audio_url TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'processing', 'published', 'failed', 'archived')),
  content_hash TEXT UNIQUE,
  published_at TEXT,
  ingested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_articles_publication ON articles (status, published_at DESC, id);
CREATE INDEX idx_articles_category_feed ON articles (category_id, status, published_at DESC);
CREATE INDEX idx_articles_status_updated ON articles (status, updated_at);
