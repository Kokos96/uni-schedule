# Release Notes — `uni-schedule 2.0` (`v2.0.0`)

**Release Title:** `uni-schedule 2.0 — Graphite Glass Redesign`  
**Tag:** `v2.0.0`  
**Target Branch:** `main` (prepared on `redesign/uni-schedule-2.0`, branched from `8b6aa9a`)  
**Application:** `Розклад ФЕП-33с` (`uni-schedule`)

---

## Highlights

`uni-schedule 2.0` is a full visual, architectural, and functional overhaul of the ФЕП-33с timetable PWA. It introduces the **Graphite Glass** dual-theme design system, a multi-column desktop workspace alongside a swipeable mobile layout, a live pair countdown hero, lesson notes & deadline tracking, an attendance goal calculator & weekly trend chart, a searchable teachers/classrooms directory, JSON v2 backup/restore, and full offline PWA support—while preserving backward compatibility with existing `uni_schedule_attendance_v1` and `uni_schedule_settings_v2` `localStorage` data.

---

## 1. Design Changes (Graphite Glass)

- **Dual-Polarity Themes (Dark / Light / System):**
  - **Graphite Glass Dark:** `#242522` canvas, `#30312D` primary surface, `#393A35` elevated surface, `#4A4B45` hairline borders, `#F0EEE8` primary ink, `#A8A69E` secondary ink.
  - **Warm Parchment Light:** `#F2F0EB` canvas, `#FAF9F6` primary surface, `#E9E7E1` elevated surface, `#D5D2CA` hairline borders, `#292A28` primary ink, `#5C5B55` secondary ink.
  - Inline pre-render boot script in `index.html` applies `data-theme` and `.dark` before first paint to prevent theme flashing, paired with `useTheme` (`dark` / `light` / `system`).
- **Editorial Mineral Accents:**
  - **Warm Amber** (`#D88B45`) for active navigation, live pair illumination, and focus rings.
  - **Terracotta** (`#D77B59`) for `Практична`, `Н-ка` (`absent`), and urgent/overdue deadlines.
  - **Sage** (`#AAB5A0`) for `Лабораторна`, `Був` (`present`), and positive attendance trends.
  - **Muted Beige** (`#D8CBB8`) for `Лекція` badges, metadata chips, and neutral-warm tags.
  - Theme-tuned foreground (`--accent-*-fg`) and non-text graphic (`--chart-*`) tokens ensure legible contrast in both themes.
- **Selective Glassmorphism:**
  - Frosted blur utilities (`.glass-panel`, `.glass-strong`, `.glass-amber-lit` in `src/index.css`) are reserved for floating, navigational, and active surfaces (`BottomNav`, `SidebarNav`, `LivePairHero`, `OfflineBanner`, `ModalDrawer`), while standard timetable cards stay crisp and matte.
- **Editorial Typography & Hand-Drawn SVG Details:**
  - `Inter` for UI copy, `Literata` serif for editorial view headings, and `JetBrains Mono` (`tabular-nums`) for time ranges, pair numbers, room codes, and countdown timers.
  - Custom hand-drawn SVG ornaments and empty-state illustrations in `src/components/ui/EditorialOrnaments.tsx` (`EditorialUnderline`, `CornerBrackets`, `SectionRule`, `WeekendIllustration`, `FreeDayIllustration`, `EmptyAttendanceIllustration`, `EmptyNotesIllustration`).

---

## 2. New Functionality

- **Live Pair Hero Timer (`LivePairHero` & `useCurrentPair`):**
  - Displays the active pair or upcoming next pair with real-time remaining countdown, progress indicator, classroom/teacher chips, and quick attendance actions.
  - High-frequency 1-second timer updates are isolated from unrelated views.
- **Lesson Notes, Homework, Links & Linked Deadlines (`LessonNotesDrawer` & `useNotes`):**
  - Clicking any lesson card or grid cell opens a responsive drawer/sheet supporting both date-specific and general subject notes, optional external links, homework due dates, and one-click linked deadline creation.
- **Deadlines Tab (`DeadlinesView` & `useDeadlines`):**
  - Dedicated tab for tracking assignments and deadlines with `active`, `overdue`, `completed`, and `all` filters, `normal` / `high` priority levels, subject/lesson linking, completion checkboxes, and live badge counts in navigation.
- **Attendance Target Calculator (`AttendanceCalculator` & `attendanceMath.ts`):**
  - Interactive goal threshold (`50%–100%`, with `70%` / `75%` / `80%` / `85%` / `90%` presets) showing whether the goal is met and calculating how many skips remain or how many consecutive classes are needed to reach the target.
- **Weekly Trend SVG Chart (`AttendanceTrends`):**
  - Responsive SVG bar chart plotting up to 8 recent weeks of attendance against the user's goal line, with color-coded bars and keyboard/pointer inspection.
- **Teachers & Classrooms Directory (`DirectoryView`, `TeachersList`, `ClassroomsList`):**
  - Unified searchable directory replacing the static inline teacher list, featuring live search, building/department filters, and expandable per-teacher / per-classroom timetable slots.
- **JSON v2 Export & Import (`BackupSection` & `utils/backup.ts`):**
  - Exports attendance, settings, notes, and deadlines in a structured `schemaVersion: 2` JSON file (`UniScheduleBackupV2`), with copy-to-clipboard and file download.
  - Validates imported files (supporting both `v2` payloads and `legacy_attendance_v1` arrays), previews item counts before applying, and supports **Merge** (deduplicated) or **Replace** modes.

---

## 3. PWA Improvements

- **Custom Icon Suite (Glass Layers Concept 02):**
  - Added complete icon assets in `public/icons/`: `icon-192.png`, `icon-512.png`, `icon-1024.png`, `icon-maskable-512.png`, halo-free `apple-touch-icon.png` (`180x180`), `favicon-32x32.png`, and `favicon.ico`.
- **Updated Web App Manifest (`public/manifest.json`):**
  - Configured `id: "/"`, `lang: "uk"`, `start_url: "/"`, `scope: "/"`, `display: "standalone"`, Graphite `#242522` `background_color` / `theme_color`, Ukrainian app description, and `any` + `maskable` icon declarations.
- **Network-First Service Worker & Offline Fallback (`public/sw.js`, `public/offline.html`):**
  - Precaches `'/'`, `'/index.html'`, `'/offline.html'`, `'/manifest.json'`, and core icons into `rozklad-shell-v2`.
  - Uses network-first navigation caching with `/offline.html` fallback, cache-first storage for content-hashed `/assets/*` bundles in `rozklad-assets-v2`, and controlled updates via `OfflineBanner` (`SKIP_WAITING` message) so active sessions are not abruptly reloaded mid-input.

---

## 4. Animation Improvements

- **Smaller Motion Footprint (`LazyMotion`):** `AppMotionProvider` wraps the app with `<LazyMotion features={domAnimation}>` and `<MotionConfig reducedMotion="user">`, pairing `m.*` primitives with Vite manual chunk splitting (`motion-vendor`).
- **Non-Blocking Tab Transitions (`PageTransition`):** Uses keyed entry transitions without blocking `<AnimatePresence mode="wait">`, keeping rapid tab switches responsive.
- **Shared-Element `layoutId` Indicators:** Smooth spring-animated active indicators across `BottomNav`, `SidebarNav`, `WeekStrip`, `SegmentedControl`, and filter switches.
- **Mobile Horizontal Swipe Gestures:** `SwipeableDayContainer` and `WeekStrip` support horizontal touch swipes to move between days cleanly.
- **Reduced Motion Support:** Respects `prefers-reduced-motion` across all Framer Motion components (`useAppReducedMotion`) and CSS rules (`src/index.css`), clamping transitions and disabling pulsing/pinging animations when reduced motion is preferred.

---

## 5. Responsive Improvements

- **Mobile (`320px–430px`):**
  - Floating glass `BottomNav` with safe-area padding (`pb-safe`), compact `WeekStrip` with week steppers and swipeable day list, bottom-sheet `ModalDrawer`, and an `xs: 360px` breakpoint for tight viewports.
- **Desktop (`1024px–1920px+`):**
  - Persistent `SidebarNav` with live pair status indicator, theme switcher, and `1`–`5` keyboard tab shortcuts.
  - Multi-column Day Dashboard (`ScheduleView`) pairing today's timetable with `LivePairHero` and upcoming deadlines, plus a toggleable 5-column `WeekGrid` (`День` / `Тиждень` mode).

---

## 6. Bug Fixes

- **TypeScript Build (`TS5097`):** Fixed `import App from './App.tsx'` -> `'./App'` in `src/main.tsx` and restored `"build": "tsc --noEmit && vite build"` in `package.json`.
- **Immutable Attendance State & Safe Storage (`useAttendance.ts`):** Replaced in-place array element mutation (`updated[existingIndex].status = status`) with immutable object copies and wrapped storage reads/writes in guarded `readStorage`/`writeStorage` helpers.
- **Empty Statistics `100%` Bug (`StatsView.tsx`):** Replaced the misleading `100%` value when `totalMarked === 0` with an explicit empty-state message (`Ще немає жодної відмітки за період`) and zero-safe percentages.
- **Teacher Subject Metadata (`src/data/teachers.json`):** Updated `t_bovgyra` (`Бовгира Олег Вікторович`) to include `"Людина і космос"` alongside `"Вибрані розділи мови програмування C"`.
- **Accessibility & Contrast Fixes:**
  - Achieved WCAG 2.1 AA text and UI contrast across both Graphite Dark and Parchment Light themes.
  - Removed `maximum-scale=1.0, user-scalable=no` from `index.html` to restore pinch-to-zoom, and restored text selection on timetable content.
  - Added `focus-visible:ring-2 focus-visible:ring-amber` outlines to `SegmentedControl` and `WeekGrid` interactive controls, plus descriptive `aria-label`, `aria-current`, `aria-pressed`, and modal focus trapping.
- **Small-Screen Overflow Fixes (`320px` / `375px`):** Resolved horizontal overflow and cramped button/badge wrapping across navigation, segmented controls, and lesson cards.

---

## 7. Known Limitations

- **Per-Device `localStorage` Persistence:** Attendance records (`uni_schedule_attendance_v1`), user settings (`uni_schedule_settings_v2`), lesson notes, and deadlines are stored locally in the browser and do not sync automatically across devices; transfer data between devices using **Опції -> Резервна копія (JSON v2)**.
- **Static Bundled Timetable Data:** Schedule, teacher, and classroom datasets (`src/data/schedule.json`, `teachers.json`, `classrooms.json`) are bundled at build time for group ФЕП-33с without a live university API backend.
- **Local CLI Tooling Availability:** `gh` CLI and `vercel` CLI are not installed in the WSL workspace environment; GitHub releases and Vercel deployment inspections/promotions are handled via Git pushes to `main` and the Vercel/GitHub web dashboards.
