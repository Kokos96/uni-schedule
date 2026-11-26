-- Migration 0010: Uni Schedule v4.3.0 Release Communication & Release Push Notifications
-- Strictly additive & backward-compatible with v4.2.1 Workers and older frontend clients.

-- 1. Opt-in preference for release/news notifications (default 0 = OFF for all existing & new users)
--    plus server-managed consent timestamp for release eligibility cutoff
ALTER TABLE notification_preferences
  ADD COLUMN release_updates_enabled INTEGER NOT NULL DEFAULT 0;

ALTER TABLE notification_preferences
  ADD COLUMN release_updates_enabled_at TEXT;

-- 2. Published releases registry (supplements canonical release metadata for runtime publication control)
CREATE TABLE IF NOT EXISTS releases (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL UNIQUE,
  publication_status TEXT NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'published')),
  published_at TEXT,
  eligibility_cutoff_at TEXT,
  github_release_url TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_releases_status_version ON releases(publication_status, version);

-- 3. Persistent idempotent delivery state: at most 1 logical delivery per (release_id, user_id)
CREATE TABLE IF NOT EXISTS release_notification_deliveries (
  release_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  subscription_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'expired', 'skipped', 'unknown')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (release_id, user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_release_deliveries_status
  ON release_notification_deliveries(release_id, status);
