-- Conservative D1 repair script for v4.1.1 (DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT APPROVAL)
-- Purpose: Clear unverified/contaminated university_groups.faculty_id values written by pre-v4.1.1
-- schedule syncs, and apply only authoritative verified LNU catalog associations.
-- Preserves all canonical group IDs, schedule_entries, student_profiles, attendance_records,
-- notes, deadlines, and push_subscriptions.

-- 1. Inspect potentially contaminated rows first (read-only audit):
-- SELECT id, group_name, faculty_id, course FROM university_groups WHERE university_id = 'lnu' AND faculty_id IS NOT NULL;

-- 2. Reset unverified faculty_id values to NULL (keeping unknown associations unknown):
UPDATE university_groups
SET faculty_id = NULL,
    program_id = NULL,
    metadata_source = NULL
WHERE university_id = 'lnu';

-- 3. Apply authoritative LNU catalog mappings:
-- Faculty 1005 (Електроніка та комп'ютерні технології)
UPDATE university_groups SET faculty_id = '1005', program_id = 'lnu-1005-se', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ФЕП-%';
UPDATE university_groups SET faculty_id = '1005', program_id = 'lnu-1005-cs', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND (group_name LIKE 'ФЕІ-%' OR group_name LIKE 'ФЕІМ-%');
UPDATE university_groups SET faculty_id = '1005', program_id = 'lnu-1005-ist', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ФЕС-%';
UPDATE university_groups SET faculty_id = '1005', program_id = 'lnu-1005-el', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND (group_name LIKE 'ФЕЛ-%' OR group_name LIKE 'ФЕЛМ-%');
UPDATE university_groups SET faculty_id = '1005', program_id = 'lnu-1005-mnt', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ФЕМ-%';

-- Faculty 1007 (Іноземні мови)
UPDATE university_groups SET faculty_id = '1007', program_id = 'lnu-1007-en', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ІНА-%';
UPDATE university_groups SET faculty_id = '1007', program_id = 'lnu-1007-de', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ІНН-%';
UPDATE university_groups SET faculty_id = '1007', program_id = 'lnu-1007-fr', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ІНФ-%';
UPDATE university_groups SET faculty_id = '1007', program_id = 'lnu-1007-es', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ІНІ-%';
UPDATE university_groups SET faculty_id = '1007', program_id = 'lnu-1007-tr', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ІНП-%';

-- Faculty 1013 (Прикладна математика та інформатика)
UPDATE university_groups SET faculty_id = '1013', program_id = 'lnu-1013-cs', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND (group_name LIKE 'ПМІ-%' OR group_name LIKE 'ПМІМ-%');
UPDATE university_groups SET faculty_id = '1013', program_id = 'lnu-1013-am', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ПМА-%';
UPDATE university_groups SET faculty_id = '1013', program_id = 'lnu-1013-cb', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ПМК-%';
UPDATE university_groups SET faculty_id = '1013', program_id = 'lnu-1013-sa', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ПМП-%';

-- Faculty 1012 (Педагогічна освіта) & 1014 (Управління фінансами та бізнесу)
UPDATE university_groups SET faculty_id = '1012', program_id = 'lnu-1012-pd', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'ФПД-%';
UPDATE university_groups SET faculty_id = '1014', program_id = 'lnu-1014-fin', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND (group_name LIKE 'УФФ-%' OR group_name LIKE 'УФФМ-%');
UPDATE university_groups SET faculty_id = '1014', program_id = 'lnu-1014-pub', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND (group_name LIKE 'УФП-%' OR group_name LIKE 'УФПМ-%');
UPDATE university_groups SET faculty_id = '1014', program_id = 'lnu-1014-acc', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'УФО-%';
UPDATE university_groups SET faculty_id = '1014', program_id = 'lnu-1014-econ', metadata_source = 'lnu-catalog-v4.1.1' WHERE university_id = 'lnu' AND group_name LIKE 'УФЕ-%';
