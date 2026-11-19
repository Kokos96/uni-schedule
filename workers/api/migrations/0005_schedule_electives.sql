-- Migration 0005: Schedule elective keys, tracks, profile departments/selected electives & schedule_change preference

ALTER TABLE schedule_entries ADD COLUMN elective_key TEXT;
ALTER TABLE schedule_entries ADD COLUMN week_type TEXT;
ALTER TABLE schedule_entries ADD COLUMN group_label TEXT;

ALTER TABLE student_profiles ADD COLUMN department TEXT;
ALTER TABLE student_profiles ADD COLUMN selected_electives TEXT;
ALTER TABLE student_profiles ADD COLUMN selected_track INTEGER;

ALTER TABLE notification_preferences ADD COLUMN schedule_change_enabled INTEGER NOT NULL DEFAULT 1;
