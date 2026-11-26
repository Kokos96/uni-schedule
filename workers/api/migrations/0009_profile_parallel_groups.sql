-- Uni Schedule v4.2.1: additive column for universal parallel subgroup personalization
-- (e.g. first/second foreign language & teacher subgroups in combined-group schedules).
-- Safe for zero-downtime rollout: nullable TEXT JSON map, backward-compatible with v4.2.0 clients.
ALTER TABLE student_profiles ADD COLUMN selected_parallel_groups TEXT;
