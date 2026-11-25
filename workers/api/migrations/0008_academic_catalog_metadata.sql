-- Additive migration 0008: Track verified academic program and metadata provenance
-- Never modifies existing user profiles, attendance, notes, deadlines, or schedule_entries.

ALTER TABLE university_groups ADD COLUMN program_id TEXT;
ALTER TABLE university_groups ADD COLUMN metadata_source TEXT;
