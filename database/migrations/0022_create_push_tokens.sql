-- Registrations are delivery addresses, not user profiles. Preferences opt out
-- by default and a single installation can safely rotate its provider token.
CREATE TABLE push_tokens (
  installation_id TEXT PRIMARY KEY NOT NULL
    CHECK (length(installation_id) BETWEEN 16 AND 128),
  token TEXT NOT NULL UNIQUE CHECK (length(token) BETWEEN 20 AND 256),
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  app_environment TEXT NOT NULL
    CHECK (app_environment IN ('development', 'preview', 'production')),
  breaking_news INTEGER NOT NULL DEFAULT 0 CHECK (breaking_news IN (0, 1)),
  briefings INTEGER NOT NULL DEFAULT 0 CHECK (briefings IN (0, 1)),
  category_slugs TEXT NOT NULL DEFAULT '[]'
    CHECK (json_valid(category_slugs) AND json_type(category_slugs) = 'array'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  revoked_at TEXT
);

CREATE INDEX idx_push_tokens_active_environment
  ON push_tokens (app_environment, revoked_at);
