# Phase E — Schedule Engine & LNU Integration QA

## Confirmed Defects Fixed
1. **Faculty cache collision:** `NormalizedSchedule` (`src/integrations/universities/types.ts`) and `parseLnuScheduleHtml` (`src/integrations/universities/lnu/lnuParser.ts`) now propagate `facultyId`, and `hasMatchingCache` (`src/hooks/useScheduleSource.ts`) + `workers/api/src/routes/universities.ts` validate `facultyId` before serving cached schedules.
2. **`buildStableLessonId` backward compatibility:** Restored `buildStableLessonId` in `src/integrations/universities/normalizers/scheduleNormalizer.ts` to preserve invariant lesson IDs (`lnuParser.test.ts`: 8/8 pass) while `toAppScheduleBundle` distinguishes same-slot lesson types.
3. **Live LNU Staging Check:**
   - `GET /api/universities/lnu/faculties` -> 23 faculties
   - `GET /api/universities/lnu/groups` -> 1500 groups
   - `GET /api/schedule?universityId=lnu&group=ФЕП-33с` -> 64 lessons, 13 electives detected
