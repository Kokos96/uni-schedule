# Project Audit — `uni-schedule` (v1.x Baseline)

**Audit Date:** 2026-11-13  
**Repository:** `/home/kostia/projects/rozklad/` (`origin`: `git@github.com:Kokos96/uni-schedule.git`)  
**Active Branch:** `redesign/uni-schedule-2.0` (clean working tree; baseline branches `main` and `backup/pre-uni-schedule-2.0` present)  
**Latest Commit Audited:** `8b6aa9a` (`fix: remove node_modules from repository and update gitignore`)

---

## 1. Tech Stack & Build Baseline

| Tool / Dependency | Declared Version | Notes |
|---|---|---|
| React / React DOM | `^18.3.1` | StrictMode enabled in `src/main.tsx` |
| Vite | `^5.4.10` (`5.4.21` installed) | Default `@vitejs/plugin-react` config, no PWA plugin |
| TypeScript | `~5.6.2` | `strict: true`, but `noUnusedLocals: false`, `noUnusedParameters: false` |
| Tailwind CSS | `^3.4.15` | Default config, no custom design tokens or `darkMode` config |
| Framer Motion | `^11.18.2` | Used minimally in `App.tsx` and `PairCard.tsx` |
| Lucide React | `^0.460.0` | Iconography |
| `clsx` / `tailwind-merge` | `^2.1.1` / `^2.6.1` | Installed in `package.json`, **0 imports anywhere in `src/`** |

### Observed Verification Results

1. **Production Build (`npm run build` / `vite build`):** Succeeds in `5.89s` (1,942 modules transformed):
   - `dist/index.html`: `0.81 kB` (gzip `0.43 kB`)
   - `dist/assets/index-Dbn5To3a.css`: `16.33 kB` (gzip `3.77 kB`)
   - `dist/assets/index-BiZ4iDWy.js`: `289.99 kB` (gzip `92.08 kB`) — **~290 KB JS baseline**
2. **TypeScript Compiler Check (`npx tsc --noEmit`):** **FAILS (exit code 1)**:
   - `src/main.tsx(3,17): error TS5097: An import path can only end with a '.tsx' extension when 'allowImportingTsExtensions' is enabled.`
   - `package.json` `"build": "vite build"` bypasses `tsc` (changed in commit `3cfd024`).

---

## 2. Current File Inventory

Total source footprint is 21 inspected project files (1,313 lines across config, data, hooks, types, and UI):

- **Config & Entry:** `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `public/manifest.json`, `src/main.tsx`, `src/index.css`
- **Data (`src/data/`):**
  - `schedule.json` (307 lines): 5 weekdays (Mon–Fri, `dayNumber` 1–5), 21 lesson entries for group ФЕП-33с.
  - `teachers.json` (14 lines): 12 teachers (`t_*`).
  - `classrooms.json` (15 lines): 13 classrooms (`c_*`) across 3 locations (`вул. Драгоманова`, `вул. Тарнавського`, `Головний корпус`).
- **Types (`src/types/index.ts`):** `WeekType`, `LessonType`, `AttendanceStatus`, `DepartmentType`, `ElectiveType`, `UserSettings`, `Lesson`, `AttendanceRecord`, `Teacher`, `Classroom`.
- **Hooks (`src/hooks/`):**
  - `useAttendance.ts`: CRUD/toggle for `AttendanceRecord[]` in `localStorage`.
  - `useCurrentPair.ts`: 10-second interval computing `currentLesson`, `nextLesson`, `currentTimeStr`.
  - `useSettings.ts`: `UserSettings` state in `localStorage`.
- **Components (`src/components/`):**
  - `layout/BottomNav.tsx`: Fixed bottom navigation bar (`schedule`, `stats`, `teachers`, `settings`).
  - `schedule/PairCard.tsx`: Lesson card with badge, time, classroom, teacher, and 3-button attendance bar.
  - `stats/StatsView.tsx`: Monthly / semester attendance summary and per-subject progress bars.
  - `settings/SettingsView.tsx`: Department, subgroup, elective selectors + static iOS Safari install tip.
- **Empty / Unused Directories:** `public/icons/`, `src/assets/`, `src/components/classrooms/`, `src/components/teachers/`, `src/utils/`.

---

## 3. Working Features (Must Preserve)

1. **Schedule Filtering (`src/App.tsx`):** Filters `schedule.json` lessons by `subgroup` (`1 | 2`), `departments` (`sp`, `oit`, `rks`, `rkt`), and Monday `electiveKey` (`freelance`, `management`, `space`, or `both`).
2. **Week Strip & Date Navigation (`src/App.tsx`):** Displays Mon–Fri dates for the active week, ±7 day week steppers, and a "Сьогодні" reset button.
3. **Live Pair Highlight (`src/hooks/useCurrentPair.ts`, `src/App.tsx`):** Highlights the active lesson on today's date (`isCurrent`) with a `#0A84FF` border and shadow.
4. **3-State Attendance Tracking (`src/hooks/useAttendance.ts`, `PairCard.tsx`):** Toggles `present` ("Був"), `absent` ("Н-ка"), and `excused` ("Поважна") per `(lessonId, date)` with toggle-off on repeat click and haptic feedback (`navigator.vibrate(15)`).
5. **Monthly & Semester Statistics (`src/components/stats/StatsView.tsx`):** Mode toggle (`По місяцях` vs `Весь семестр`), month pagination (`ChevronLeft`/`ChevronRight`), aggregate counts, and stacked subject progress bars.
6. **Settings Persistence (`src/hooks/useSettings.ts`, `SettingsView.tsx`):** Persists department, subgroup, and elective course across reloads.

---

## 4. Confirmed Bugs, Technical Debt & Architectural Gaps

### 4.1 Critical Bugs & Data Issues
| Area | Finding | Location |
|---|---|---|
| **TypeScript Build Failure** | `import App from './App.tsx'` fails `tsc --noEmit` (`TS5097`) because `allowImportingTsExtensions` is `false`. | `src/main.tsx:3`, `tsconfig.json:9` |
| **In-Place State Mutation** | `updated[existingIndex].status = status` mutates an existing `AttendanceRecord` object inside React state instead of creating a new object `{ ...updated[existingIndex], status }`. | `src/hooks/useAttendance.ts:34-36` |
| **Unguarded `localStorage.setItem`** | Both `useAttendance` and `useSettings` wrap `getItem` in `try/catch`, but `setItem` in `useEffect` has no `try/catch` (can throw `QuotaExceededError` or fail in restricted storage contexts). | `src/hooks/useAttendance.ts:17`, `src/hooks/useSettings.ts:23` |
| **Misleading 100% Empty State** | When `totalMarked === 0`, `StatsView` displays `100%` attendance instead of an empty state or `—`. | `src/components/stats/StatsView.tsx:49,125` |
| **Stats Ignore User Settings** | `StatsView` aggregates all `records` even if they belong to a previously selected subgroup/department/elective, and never resolves total scheduled lessons. | `src/components/stats/StatsView.tsx:41-62` |
| **Teacher Metadata Mismatch** | `mon_4_space_lec` ("Людина і космос") references `t_bovgyra`, whose `teachers.json` entry only lists `"Вибрані розділи мови програмування C"`. | `src/data/schedule.json:46-57`, `src/data/teachers.json:9` |
| **UTC vs Local Date Key** | `key={d.toISOString()}` uses UTC timestamp while `formatIsoDate(d)` uses local calendar components. | `src/App.tsx:24-29,137` |
| **Weekend Selection Gap** | `weekDates` only generates Mon–Fri (`[0..4]`); when `currentDate` is Saturday or Sunday, no day pill is active and there is no quick jump to Monday. | `src/App.tsx:48-56,131-153` |

### 4.2 Unused Code & Half-Built Features
- **`nextLesson` & `currentTimeStr` Unused:** `useCurrentPair` calculates and returns `{ currentLesson, nextLesson, currentTimeStr }`, but `App.tsx` line 73 only consumes `{ currentLesson }`. There is no "Next Lesson" / countdown banner.
- **`WeekType` Unused:** `WeekType = 'numerator' | 'denominator' | 'both'` exists in `src/types/index.ts` and every lesson in `schedule.json`, yet no parity calculation, indicator, or filter exists.
- **Empty Feature Folders:** `src/components/teachers/`, `src/components/classrooms/`, `src/utils/` are empty; the Teachers view is hardcoded inline in `src/App.tsx:197-214` with no search/filter, and `classrooms.json` has no dedicated view or building filter.
- **Unused Dependencies:** `clsx` and `tailwind-merge` are bundled in `package.json` dependencies without usage.

### 4.3 Layout, UX & Feature Gaps (vs. `uni-schedule 2.0` Targets)
1. **Desktop Limitation (`max-w-md`):** Every single container (`header`, `main`, `teachers`, `StatsView`, `SettingsView`, `BottomNav`) is hard-capped at `max-w-md` (`448px`). On `1024px–1920px+` screens, >75% of the viewport is empty `#000000` background. There is no desktop dashboard, no 5-day Week Grid, and no desktop sidebar/header navigation.
2. **No Mobile Swipe Navigation:** Users must tap tiny `ChevronLeft`/`ChevronRight` week buttons or individual day pills; horizontal swipe gestures between days are absent.
3. **No Theme Switcher / Visual System:** Hardcoded `#000000`, `#1C1C1E`, `#0A84FF` with `color-scheme: dark` only (`src/index.css`, `index.html`). No Graphite Glass design tokens or Light/Dark/System switching.
4. **No Notes, Homework or Deadlines:** No way to attach per-lesson notes, track homework, or manage upcoming deadlines.
5. **No Attendance Calculator or Trends:** `StatsView` lacks a target attendance threshold (e.g., 75% / 80%), "skips remaining / classes needed" calculator, and weekly/monthly trend visualization.
6. **No Backup Export / Import:** Users cannot export or restore their attendance/settings/notes via JSON with schema versioning.

### 4.4 PWA & Offline Gaps
- **`public/icons/` is completely empty (`0` files)** despite `index.html:9` requesting `/icons/apple-touch-icon.png` (returns 404).
- **`public/manifest.json` has `"icons": []`**, missing `192x192`, `512x512`, `maskable` icons, `id`, `description`, and `lang`.
- **No Service Worker / Offline Cache:** Zero offline support (`vite-plugin-pwa` or custom `sw.js` is absent), meaning the app fails to load offline in standalone PWA mode.

### 4.5 Accessibility (WCAG) & Motion Gaps
- **Pinch-to-Zoom Disabled (`index.html:5`):** `maximum-scale=1.0, user-scalable=no` violates WCAG 2.1 SC 1.4.4 (Resize Text).
- **Text Selection Blocked (`src/index.css:14-16`):** Global `user-select: none` prevents copying subject titles, teacher names, and classroom addresses.
- **Missing ARIA Semantics:**
  - Icon-only month chevron buttons in `StatsView.tsx:101-117` have neither `aria-label` nor `title`.
  - `BottomNav.tsx` lacks `aria-label="Основна навігація"` and `aria-current="page"`.
  - Segmented/toggle controls (`PairCard`, `StatsView`, `SettingsView`, day pills) lack `aria-pressed` or `role="radiogroup"`/`aria-checked`.
  - Non-schedule views (`StatsView`, `teachers`, `SettingsView`) do not render inside `<main>` landmarks.
- **Color Contrast Issues:**
  - Active `Був` (`bg-emerald-500 text-white`, ~2.5:1) and `Н-ка` (`bg-rose-500 text-white`, ~3.8:1) fail WCAG AA `4.5:1` text contrast.
  - `text-neutral-500` (`#737373`) on `#1C1C1E` (~3.6:1) fails AA contrast for `10px`/`11px` labels.
- **Reduced Motion Missing:** `framer-motion` animations in `App.tsx` and `PairCard.tsx` lack `<MotionConfig reducedMotion="user">` and CSS `@media (prefers-reduced-motion: reduce)` fallbacks. Also `<AnimatePresence mode="wait">` on the entire day list delays rapid day switching.

---

## 5. `localStorage` Preservation Contract (CRITICAL)

Existing user data stored in browser `localStorage` **MUST NOT** be broken or silently discarded:

1. **`uni_schedule_attendance_v1`**
   - Format: `AttendanceRecord[]` JSON array:
     ```json
     [{ "lessonId": "tue_1_soft_1", "date": "2026-11-10", "status": "present" }]
     ```
   - `status` values: `"present" | "absent" | "excused"`.
   - Must remain readable and writable under the exact key `uni_schedule_attendance_v1`.
2. **`uni_schedule_settings_v2`**
   - Format: `UserSettings` JSON object:
     ```json
     { "subgroup": 1, "department": "sp", "electiveCourse": "freelance" }
     ```
   - Must remain readable and writable under the exact key `uni_schedule_settings_v2`. Any new v2.0 fields (`theme`, `attendanceGoal`, `weekParityMode`, etc.) **must be optional with safe defaults** merged on load (`{ ...DEFAULT_SETTINGS, ...parsed }`) and validated per-field so v1.x records never fail parsing.
