# Phase E — Web Push & Cron Scheduler QA

## Confirmed Defects Fixed
1. **Dead subscription pruning in Cron:** `workers/api/src/push/scheduler.ts` now enforces `WHERE ps.fail_count < 10` when selecting push subscriptions.
2. **Recurring lessons without `lesson_date`:** `weekLessons` query in `workers/api/src/push/scheduler.ts` now includes `OR lesson_date IS NULL`.
3. **`schedule_change_enabled` persistence:** Wired `scheduleChangeEnabled` (`schedule_change_enabled` from migration `0005_schedule_electives.sql`) through `PreferenceRow`, `DEFAULT_PREFERENCES`, `mapPreferenceRow`, `GET /api/push/preferences`, and `PUT /api/push/preferences` in `workers/api/src/routes/push.ts`, verified both in unit tests (`push.test.ts`: 4/4 pass) and on live staging (`PUT /api/push/preferences` returning `scheduleChangeEnabled: false`).
