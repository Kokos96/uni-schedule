-- Existing profiles retain their historical live source until an explicit transition.
ALTER TABLE student_profiles ADD COLUMN source_mode TEXT NOT NULL DEFAULT 'live'
  CHECK (source_mode IN ('unconfigured', 'builtin', 'live', 'manual'));
ALTER TABLE student_profiles ADD COLUMN revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE schedule_entries ADD COLUMN track_number INTEGER;

-- Preserve legitimate push notifications for existing configured live profiles.
UPDATE student_profiles
SET revision = 1
WHERE source_mode = 'live'
  AND revision = 0
  AND group_id IS NOT NULL
  AND TRIM(group_id) != '';
