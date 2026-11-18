-- Migration 0001: Stage 3 Backend & Database schema (Cloudflare D1 / SQLite)

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_id ON user_devices(user_id);
CREATE INDEX IF NOT EXISTS idx_user_devices_token_hash ON user_devices(token_hash);

CREATE TABLE IF NOT EXISTS universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  city TEXT NOT NULL,
  support_status TEXT NOT NULL CHECK (support_status IN ('live', 'manual_only')),
  source_url TEXT
);

CREATE TABLE IF NOT EXISTS student_profiles (
  user_id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL,
  faculty_id TEXT,
  faculty_name TEXT,
  course INTEGER,
  group_id TEXT NOT NULL,
  group_name TEXT NOT NULL,
  subgroup INTEGER NOT NULL DEFAULT 1 CHECK (subgroup IN (1, 2)),
  elective_course TEXT NOT NULL DEFAULT 'freelance',
  timezone TEXT NOT NULL DEFAULT 'Europe/Kyiv',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (university_id) REFERENCES universities(id)
);

CREATE TABLE IF NOT EXISTS university_groups (
  id TEXT PRIMARY KEY,
  university_id TEXT NOT NULL,
  faculty_id TEXT,
  course INTEGER,
  group_code TEXT NOT NULL,
  group_name TEXT NOT NULL,
  content_hash TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (university_id) REFERENCES universities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_university_groups_lookup
  ON university_groups(university_id, course, group_name);

CREATE TABLE IF NOT EXISTS schedule_entries (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  lesson_date TEXT,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  pair_number INTEGER NOT NULL CHECK (pair_number BETWEEN 1 AND 12),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  subject TEXT NOT NULL,
  lesson_type TEXT NOT NULL,
  teacher TEXT,
  room TEXT,
  building TEXT,
  subgroup INTEGER CHECK (subgroup IN (1, 2)),
  is_elective INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  updated_at TEXT NOT NULL,
  FOREIGN KEY (group_id) REFERENCES university_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_entries_group_date
  ON schedule_entries(group_id, lesson_date, pair_number);

CREATE TABLE IF NOT EXISTS schedule_sync_logs (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'skipped')),
  entries_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  synced_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_sync_logs_group
  ON schedule_sync_logs(group_id, synced_at DESC);

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

-- Seed initial university registry
INSERT OR IGNORE INTO universities (id, name, short_name, city, support_status, source_url)
VALUES
  ('lnu', 'Львівський національний університет імені Івана Франка', 'ЛНУ ім. Івана Франка', 'Львів', 'live', 'https://dekanat.lnu.edu.ua/cgi-bin/timetable.cgi'),
  ('other', 'Інший університет (ручний / локальний режим)', 'Інший ВНЗ', 'Україна', 'manual_only', NULL);
