-- Migration 0004: Stage 6 Security Hardening — Server-side monotonic version & clock-skew protection

ALTER TABLE attendance_records ADD COLUMN server_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE attendance_records ADD COLUMN server_updated_at TEXT NOT NULL DEFAULT '';

UPDATE attendance_records
SET server_updated_at = updated_at
WHERE server_updated_at = '';
