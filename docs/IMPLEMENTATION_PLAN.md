# Implementation Plan — `uni-schedule 2.0` (Graphite Glass)

**Target Branch:** `redesign/uni-schedule-2.0`  
**Base Constraint:** Preserve 100% of existing schedule data (`schedule.json`, `teachers.json`, `classrooms.json`) and existing `localStorage` keys (`uni_schedule_attendance_v1`, `uni_schedule_settings_v2`).

---

## Phase 1: Tooling, Strict TypeScript & Test Harness
**Goal:** Establish zero-error static checks, code quality gates, and automated verification before feature work.

1. Fix `src/main.tsx` import (`./App` instead of `./App.tsx`) so `npx tsc --noEmit` passes.
2. Tighten `tsconfig.json`: enable `noUnusedLocals: true`, `noUnusedParameters: true`, `noUncheckedIndexedAccess: true` (or fix all indexed lookups cleanly).
3. Update `package.json` scripts:
   - `"typecheck": "tsc --noEmit"`
   - `"build": "tsc --noEmit && vite build"`
4. Add `vitest` + `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` (devDependencies) for unit/integration tests of hooks, date/schedule utilities, attendance math, and backup validation.
5. Add Playwright (or dev-server headless browser check) script for the 9-viewport verification matrix.

---

## Phase 2: Core Domain Utilities & Preserved Persistence Layer
**Goal:** Extract pure logic out of `App.tsx`, fix state mutation and storage bugs, and add new v2.0 persistence stores.

1. **`src/utils/cn.ts`:** Expose `cn(...inputs)` using already-installed `clsx` + `tailwind-merge`.
2. **`src/utils/date.ts`:**
   - Local-timezone safe `formatIsoDate(d)`, `parseIsoDate(iso)`, `getWeekDates(anchor, includeWeekends?)`, `isSameDay`, `addDays`, `getWeekParity(date, semesterStart)` (`numerator` / `denominator`).
3. **`src/utils/schedule.ts`:**
   - `filterLessons(lessons, settings, weekParity?)`: pure filter handling `subgroup`, `departments`, `electiveKey`, and `weekType`.
   - Lookup maps (`Map<string, Teacher>`, `Map<string, Classroom>`) replacing repeated `.find()` scans inside render loops.
   - Fix `src/data/teachers.json`: add `"Людина і космос"` to `t_bovgyra.subjects` so teacher subject filtering matches `schedule.json`.
4. **`src/utils/storage.ts`:** Safe `readStorage<T>(key, fallback, validator)` and `writeStorage<T>(key, value)` wrapping JSON parse/stringify and `QuotaExceededError` handling.
5. **Fix `src/hooks/useAttendance.ts` (`uni_schedule_attendance_v1`):**
   - Fix in-place mutation bug: create new record object on status update.
   - Deduplicate records by `(lessonId, date)` on load; add `clearAll` / `replaceRecords` / `mergeRecords` helpers for Backup Import.
6. **Upgrade `src/hooks/useSettings.ts` (`uni_schedule_settings_v2`):**
   - Preserve `{ subgroup, department, electiveCourse }` and merge optional v2.0 fields:
     - `theme: 'dark' | 'light' | 'system'` (default `'dark'`)
     - `attendanceGoal: number` (default `80`, clamped `50..100`)
     - `showWeekends: boolean` (default `false`)
     - `semesterStartDate: string` (default `'2026-09-01'`)
7. **Upgrade `src/hooks/useCurrentPair.ts`:**
   - Actually surface `currentLesson`, `nextLesson`, `currentTimeStr`, `progressPercent`, and `minutesRemaining` for the live Hero / Now & Next widget, only active when viewing today.
8. **New Hooks:**
   - `src/hooks/useNotes.ts` (`uni_schedule_notes_v1`): per-lesson / per-date notes & homework items.
   - `src/hooks/useDeadlines.ts` (`uni_schedule_deadlines_v1`): tasks/deadlines linked to subject/lesson with due date, priority, and completion status.
   - `src/hooks/useTheme.ts`: applies `data-theme="dark" | "light"` and `<meta name="theme-color">` dynamically from `settings.theme` + `prefers-color-scheme`.

---

## Phase 3: Graphite Glass Design System & Theme Switcher
**Goal:** Replace flat `#000000`/`#1C1C1E` styling with a cohesive Graphite Glass token system supporting Dark Graphite Glass and Light Frosted Glass while meeting WCAG AA contrast.

1. **Design Tokens (`src/index.css` + `tailwind.config.js`):**
   - CSS custom properties on `:root` and `[data-theme="light"]`:
     - `--bg-canvas`, `--bg-mesh-1`, `--bg-mesh-2` (subtle ambient radial gradients)
     - `--glass-surface`, `--glass-elevated`, `--glass-border`, `--glass-highlight`
     - `--text-primary`, `--text-secondary`, `--text-muted` (AA >= 4.5:1 verified on surface)
     - `--accent-primary` (`#0A84FF` dark / `#0066CC` light), semantic status tokens (`--status-present`, `--status-absent`, `--status-excused` with AA-compliant foregrounds)
   - Reusable `.glass-card`, `.glass-panel`, `.glass-pill` utility classes with `@supports (backdrop-filter: blur(1px))` fallback.
2. **Accessibility Fixes in Global Shell:**
   - Remove `maximum-scale=1.0, user-scalable=no` from `index.html`.
   - Remove global `user-select: none` from `body`; apply `select-none` only to interactive buttons/nav pills where appropriate so users can copy lesson names, teacher names, and room addresses.
   - Add consistent `focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2` styles.
3. **Theme Switcher UI:** Segmented control in Settings (`Темна (Graphite)`, `Світла`, `Системна`) + quick toggle button in Desktop Sidebar / TopBar.

---

## Phase 4: Responsive Layout — Desktop Dashboard + Week Grid & Mobile Swipe + BottomNav
**Goal:** Eliminate the `max-w-md` desktop bottleneck and deliver tailored layouts for mobile, tablet, and desktop.

1. **Navigation Shell (`AppShell.tsx`, `SidebarNav.tsx`, `BottomNav.tsx`):**
   - **Mobile & Compact Tablet (`< 1024px`):** Persistent `BottomNav` (5 concise items or 4 primary + Deadlines badge: `Розклад`, `Завдання`, `Статистика`, `Довідник`, `Опції`) with `aria-current="page"` and safe-area insets.
   - **Desktop (`>= 1024px`):** Fixed collapsible Glass Sidebar (`240px–260px`) displaying group badge (`ФЕП-33с`), active profile (`СП • Підгр. 1`), theme toggle, quick backup status, and keyboard shortcuts (`1–5`), plus fluid `max-w-7xl` content area.
2. **Schedule View (`ScheduleView.tsx`):**
   - **Mobile (`< 768px`):**
     - Interactive Week Strip (Mon–Fri + optional weekend chip/indicator) + Month/Week header + Calendar Date Picker popover.
     - Horizontal swipe gesture (`onTouchStart`/`onTouchEnd` or Framer Motion drag with threshold) to move ±1 day (skipping/indicating weekends cleanly) + "Сьогодні" quick jump.
     - Live **"Зараз / Далі" Hero Card** powered by `useCurrentPair` (`currentLesson`, `nextLesson`, progress bar, time left).
   - **Desktop (`>= 1024px`):**
     - **View Toggle:** `День + Огляд` (2-column Dashboard: Today/Selected Day timeline on left + Live Hero Card, Upcoming Deadlines & Mini Attendance Summary on right) **AND** `Тиждень` (**5-Column Week Grid** Mon–Fri × Pair Slots 1–8, with current-day column highlight, quick attendance toggle directly inside cells, and note/deadline count badges).
3. **Directory View (`DirectoryView.tsx`):**
   - Replaces inline teachers list in `App.tsx`.
   - Sub-tabs for **Викладачі** (`src/components/teachers/`) and **Аудиторії** (`src/components/classrooms/`), with instant search and building filter (`вул. Драгоманова`, `вул. Тарнавського`, `Головний корпус`).

---

## Phase 5: Motion System
**Goal:** Smooth, hardware-accelerated, accessible animations without sluggish transitions.

1. **`src/lib/motion.ts`:** Centralized springs (`snappySpring`, `gentleSpring`), stagger variants, and duration tokens (`150ms–260ms`).
2. Wrap application root in `<MotionConfig reducedMotion="user">`.
3. Replace heavy `AnimatePresence mode="wait"` list unmount delays with fast crossfade/slide keyed by date + `layoutId` shared-element pill indicator on active tab & day selector.
4. Animate only `transform` and `opacity` (GPU-composited; zero layout-thrashing width/height transitions except `scaleX` progress bars).

---

## Phase 6: Notes, Homework & Deadlines
**Goal:** Turn the timetable into an actionable student workspace.

1. **Per-Lesson Notes & Homework (`LessonNotesDrawer.tsx`):**
   - Accessible from any `PairCard` or Desktop Week Grid cell via a clean note/task icon + badge count.
   - Add/edit/delete quick text notes and homework items tied to `(lessonId, date)` or recurring `lessonName`.
2. **Deadlines Hub (`DeadlinesView.tsx` & Dashboard Widget):**
   - Create deadlines with title, subject (auto-populated from filtered lessons), due date + optional time, priority (`normal` / `high`), and completion checkbox.
   - Filter tabs: `Активні`, `Прострочені`, `Виконані`, `Усі`.
   - Upcoming deadlines badge count shown on navigation item and Desktop Dashboard card.

---

## Phase 7: Attendance Calculator & Trends
**Goal:** Upgrade `StatsView` from passive counters to predictive student analytics.

1. **Empty State Fix:** Show `"—"` and helpful onboarding prompt when 0 classes are marked (never `100%`).
2. **Settings-Aware Filtering:** Toggle between "Актуальні предмети (за моїми налаштуваннями)" and "Усі відмічені записи".
3. **Attendance Calculator (`AttendanceCalculator.tsx`):**
   - Configurable target attendance threshold (e.g., `75%`, `80%`, `90%` stored in `settings.attendanceGoal`).
   - Computes:
     - **Safe skips remaining:** How many upcoming classes can be missed while staying >= goal.
     - **Recovery count:** How many consecutive classes must be attended to reach goal if currently below target.
   - Available both overall and per-subject.
4. **Trends Visualization (`AttendanceTrends.tsx`):**
   - Lightweight, zero-dependency SVG weekly trend sparkline / bar chart (last 6–8 active weeks) + month-over-month delta badge (`+4% vs минулий місяць`) to keep bundle size lean.

---

## Phase 8: JSON Backup Export / Import (Schema Versioned)
**Goal:** Zero-loss portability across devices and browsers.

1. **Versioned Envelope (`UniScheduleBackupV2` in `src/utils/backup.ts`):**
   ```ts
   interface UniScheduleBackupV2 {
     schemaVersion: 2;
     exportedAt: string; // ISO-8601
     appVersion: string;
     data: {
       attendance: AttendanceRecord[];
       settings: UserSettings;
       notes: LessonNote[];
       deadlines: DeadlineItem[];
     };
   }
   ```
2. **Export:** Downloads `uni-schedule-backup-YYYY-MM-DD.json` plus optional copy-to-clipboard summary.
3. **Import:**
   - File picker + strict runtime validation (checks `schemaVersion`, array/field types, valid `status`/`department`/`subgroup` enums, supports importing legacy raw v1 arrays if encountered).
   - **Pre-import preview modal:** Shows counts (attendance records, notes, deadlines, settings changes) before committing.
   - **Two modes:** `Об'єднати (Merge)` (keeps newer/unique entries without wiping) or `Замінити (Replace)` (full restore).

---

## Phase 9: PWA, Offline Support & Icons
**Goal:** Make installation and offline reliability first-class on iOS Safari, Android Chrome, and Desktop.

1. **Generate App Icons (`public/icons/`):**
   - `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png` (180x180), `favicon.svg` / `favicon-32.png`.
2. **Update `public/manifest.json` & `index.html`:**
   - Populate `icons` array with proper `sizes`, `type`, and `purpose` (`any`, `maskable`).
   - Add `id: "/"`, `description`, `lang: "uk"`, `categories: ["education", "productivity"]`.
3. **Service Worker & Offline UX (`vite-plugin-pwa` or versioned custom `public/sw.js`):**
   - Precache app shell + JSON data chunks for instant offline boot.
   - `useOnlineStatus` hook + subtle offline indicator banner and "Доступне оновлення" reload prompt when a new SW activates.

---

## Phase 10: 9-Viewport Testing, Bundle Audit & Release
**Goal:** Ship a verified, accessible, fast release.

1. **Unit & Component Tests (`vitest`):**
   - Coverage for `date.ts`, `schedule.ts`, `attendanceMath.ts`, `backup.ts`, `useAttendance.ts`, `useSettings.ts`, `useNotes.ts`, `useDeadlines.ts`.
   - Explicit test verifying migration/preservation of v1 `uni_schedule_attendance_v1` and `uni_schedule_settings_v2` payloads.
2. **9-Viewport Responsive & Visual Matrix (zero horizontal overflow, readable glass contrast, clean touch/click targets):**
   - Mobile Small: `320×568` (iPhone SE 1st gen)
   - Mobile Standard: `375×667` (iPhone SE / 8)
   - Mobile Modern: `390×844` (iPhone 14/15)
   - Mobile Large: `430×932` (iPhone Pro Max)
   - Tablet Portrait: `768×1024` (iPad)
   - Tablet Landscape / Small Laptop: `1024×768`
   - Laptop Standard: `1280×800`
   - Desktop Standard: `1440×900`
   - Desktop Wide: `1920×1080`
3. **Bundle Budget & Performance:**
   - Keep main initial JS bundle lean (code-split non-default tabs `StatsView`, `DeadlinesView`, `DirectoryView`, `SettingsView` via `React.lazy` + `Suspense`), target < 350 KB total JS / < 115 KB gzipped initial load.
4. **Release:**
   - Merge `redesign/uni-schedule-2.0` -> `main` after all checks pass.
   - Tag GitHub Release (`v2.0.0`) with changelog.
   - Verify production deployment on Vercel (PWA headers, `manifest.json`, `sw.js`, deep-link fallback).
