# Phase E — Profile, Electives & University Selector QA

## Confirmed Defects Fixed
1. **Stale University/Faculty state:** `UniversitySelectorCard.tsx` now resets `facultyId`, `groupInput`, and `groups` on university switch, resets `groupInput` on faculty switch, includes `facultyId` in `useEffect` dependencies & `groupChanged`, syncs local state with `resolved.universityProfile`, and clears `selectedElectives`/`selectedTrack` on `handleResetBuiltin`.
2. **Profile hydration across devices:** Added `fetchProfileFromBackend()` (`GET /api/profile`) in `src/services/apiClient.ts` and wired mount-time hydration in `src/hooks/useSettings.ts` when `universityProfile` is unset.
3. **Live D1 Profile Roundtrip:** Verified `PUT /api/profile` + `GET /api/profile` on staging with `universityId: "lnu"`, `facultyId: "1"`, `groupId: "ФЕП-33с"`, `subgroup: 1`, `department: "sp"`, `selectedElectives: ["elective:freelance"]`, `selectedTrack: 1`.
