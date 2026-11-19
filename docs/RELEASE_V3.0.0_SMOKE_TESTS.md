# Uni Schedule v3.0.0 — Quality Gate & Live Production Smoke Tests

## Local Quality Gate (PASS)
- `workers/api` `npm run typecheck`: PASS (0 errors)
- `npm run build` (`tsc --noEmit && vite build`): PASS (6.67s)
- `npx tsx --test tests/unit/*.test.ts workers/api/tests/api.test.ts workers/api/tests/push.test.ts`: **50/50 PASS** across 13 suites

## Live Production Smoke Tests (PASS)
- `GET /api/health`: `200` (`{"ok":true,"service":"uni-schedule-api","stage":3}`)
- `GET /api/universities/lnu/faculties`: `23` faculties
- `GET /api/universities/lnu/groups`: `1500` groups
- `GET /api/schedule?universityId=lnu&group=ФЕП-33с`: `64` lessons (`13` electives)
- `POST /api/auth/register` (`201`) -> `PUT`/`GET /api/profile` (`selectedElectives`, `selectedTrack`, `facultyId`, `department`) -> `POST /api/attendance/sync` (`200`)
- `GET /api/push/vapid-public-key` (`200`), `GET`/`PUT /api/notifications/preferences` (`scheduleChangeEnabled`, `200`), SSRF push guard (`400`)
- **Physical mobile device hardware push delivery:** NOT VERIFIED (no physical Android/iOS push test performed in this environment).
