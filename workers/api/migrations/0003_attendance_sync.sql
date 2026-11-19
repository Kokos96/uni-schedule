-- Migration 0003: Stage 5 Attendance Sync & Accurate Notification Summaries

CREATE TABLE IF NOT EXISTS attendance_records (
  user_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  lesson_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('attended', 'present', 'absent', 'excused', 'unmarked')),
  updated_at TEXT NOT NULL,
  device_id TEXT,
  PRIMARY KEY (user_id, lesson_id, lesson_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON attendance_records(user_id, lesson_date, updated_at);
