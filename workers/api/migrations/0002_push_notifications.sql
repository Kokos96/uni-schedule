-- Migration 0002: Stage 4 Web Push Subscriptions, Preferences, and Delivery Logs

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES user_devices(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_device_id ON push_subscriptions(device_id);

CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 0,
  morning_enabled INTEGER NOT NULL DEFAULT 1,
  morning_time TEXT NOT NULL DEFAULT '08:00',
  before_lesson_enabled INTEGER NOT NULL DEFAULT 1,
  before_lesson_minutes INTEGER NOT NULL DEFAULT 10 CHECK (before_lesson_minutes IN (5, 10, 15, 30)),
  before_end_enabled INTEGER NOT NULL DEFAULT 0,
  before_end_minutes INTEGER NOT NULL DEFAULT 10 CHECK (before_end_minutes IN (5, 10, 15)),
  evening_enabled INTEGER NOT NULL DEFAULT 1,
  evening_time TEXT NOT NULL DEFAULT '20:00',
  friday_enabled INTEGER NOT NULL DEFAULT 1,
  friday_time TEXT NOT NULL DEFAULT '18:00',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS notification_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  dedup_key TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'expired', 'failed')),
  error_message TEXT,
  sent_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notification_logs_user_sent ON notification_logs(user_id, sent_at DESC);
