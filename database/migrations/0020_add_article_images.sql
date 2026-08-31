CREATE TABLE article_images (
  article_id TEXT PRIMARY KEY NOT NULL REFERENCES articles (id) ON DELETE CASCADE,
  article_key TEXT NOT NULL,
  thumbnail_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  provenance_kind TEXT NOT NULL CHECK (
    provenance_kind IN ('permitted-source', 'licensed-asset', 'editorial-upload', 'category-fallback')
  ),
  provenance_json TEXT NOT NULL CHECK (json_valid(provenance_json)),
  is_fallback INTEGER NOT NULL DEFAULT 0 CHECK (is_fallback IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX idx_article_images_provenance ON article_images (provenance_kind, is_fallback);
