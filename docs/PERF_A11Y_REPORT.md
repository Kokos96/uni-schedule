# Performance & Accessibility Audit Report — `uni-schedule 2.0`

**Audit Date:** 2026-11-13  
**Auditor:** Agent 9 — Performance & Accessibility Engineer  
**Scope:** Sections 11 & 12 Audit (`dist/`, `index.html`, `vercel.json`, `public/sw.js`, `src/index.css`, `src/lib/motion.ts`, `src/App.tsx`, `src/components/layout/*`, `src/components/schedule/*`, `src/components/stats/*`, `src/components/deadlines/*`, `src/components/directory/*`, `src/components/settings/*`, `src/components/ui/*`, `src/components/motion/*`, `src/hooks/*`)  
**Policy:** Read-only audit — no `src/` files were modified.

---

## Executive Summary

| Category | Status | Summary |
| :--- | :--- | :--- |
| **1. Bundle Size & Code Splitting** | **FAIL (P1)** | Lazy views are properly split into 4 separate chunks, **but** initial JS payload is **450,330 B (439.78 KiB raw) / 133,754 B (130.62 KiB gzip-9)** — exceeding the budget in `docs/ARCHITECTURE.md` & `docs/IMPLEMENTATION_PLAN.md` (`<= 350 KB raw / <= 115 KB gzipped`). |
| **2. Render & Motion Performance** | **WARN (P1)** | Zero continuous `backdrop-filter` animations; GPU-friendly transforms overall. **However**, `useCurrentPair` runs its 1-second `setInterval` inside `AppContent` (`src/App.tsx:352`), forcing full-app re-renders every second across all views/tabs during active lessons and breaks. |
| **3. Accessibility (WCAG 2.1 AA)** | **FAIL (P0/P1)** | Strong landmarks, skip link, ARIA states, modal focus trap, pinch-to-zoom, and `prefers-reduced-motion` support. **However**, there are critical WCAG 2.1 AA contrast failures (especially Light theme `ink-secondary`, `text-on-accent`, `status-excused`, `amber-fg`/`terracotta-fg` on tinted surfaces, and `text-ink-muted` in both themes), stripped `:focus-visible` outlines in `SegmentedControl` and `WeekGrid`, and duplicate `<h1>` / skipped heading levels. |
| **4. PWA Cache & Update Safety** | **WARN (P1)** | `vercel.json` headers & rewrites cleanly prevent stale asset HTML-poisoning and `sw.js` uses network-first for HTML + cache-first for `/assets/*`. **However**, `self.skipWaiting()` inside `install` (`public/sw.js:28`) bypasses the update banner and triggers an immediate forced `window.location.reload()`, and `PRECACHE_URLS` omits `'/'` for single-visit cold offline boot. |

---

## 1. Bundle Size & Code Splitting Audit

### 1.1 Exact Build Output (`dist/` & `dist/assets/`)

Measured directly from existing `dist/` artifacts (KiB = `bytes / 1024`, `gz6` = standard zlib/gzip level 6, `gz9` = max gzip level 9):

| Artifact | Role | Raw (Bytes) | Raw (KiB) | Gzip-6 (KiB) | Gzip-9 (KiB) |
| :--- | :--- | ---: | ---: | ---: | ---: |
| `assets/index-CkeFR5xt.js` | Main entry + ScheduleView + WeekGrid + LessonNotesDrawer + JSON data | 163,497 | 159.67 | 42.58 | 42.46 |
| `assets/react-vendor-KbpW3drC.js` | `react-dom` + `scheduler` | 133,934 | 130.79 | 42.12 | 42.03 |
| `assets/motion-vendor-CwVqyBkk.js` | `framer-motion` + `react/jsx-runtime` | 117,209 | 114.46 | 38.01 | 37.89 |
| `assets/icons-vendor-BRWVq78i.js` | `lucide-react` + `react` (`react.production.min.js`) | 35,690 | 34.85 | 8.32 | 8.24 |
| **Initial JS Subtotal** | **Preloaded/executed on boot (`dist/index.html:47-50`)** | **450,330** | **439.78** | **131.02** | **130.62** |
| `assets/index-B2vYiMFh.css` | Compiled Tailwind + Graphite Glass tokens | 46,626 | 45.53 | 8.68 | 8.64 |
| `assets/DeadlinesView-BWkMfLe4.js` | Lazy chunk (`React.lazy`) | 15,260 | 14.90 | 4.65 | 4.64 |
| `assets/DirectoryView-C2QLQjqk.js` | Lazy chunk (`React.lazy`) | 13,330 | 13.02 | 3.44 | 3.43 |
| `assets/StatsView-C40ZhLRX.js` | Lazy chunk (`React.lazy`) | 28,062 | 27.40 | 8.10 | 8.09 |
| `assets/SettingsView-py2fjbOE.js` | Lazy chunk (`React.lazy`) | 30,067 | 29.36 | 7.37 | 7.35 |
| **Lazy JS Subtotal** | **4 deferred route chunks** | **86,719** | **84.69** | **23.55** | **23.51** |
| **Total JS (All Chunks)** | **Initial + Lazy** | **537,049** | **524.46** | **154.58** | **154.13** |
| `index.html` | App entry HTML | 4,786 | 4.67 | 1.64 | 1.64 |
| `sw.js` | Service Worker | 5,535 | 5.41 | 1.58 | 1.57 |
| `offline.html` | Offline fallback HTML | 3,208 | 3.13 | 1.30 | 1.30 |
| `manifest.json` | Web App Manifest | 991 | 0.97 | 0.40 | 0.40 |

### 1.2 Findings & Budget Analysis

1. **Lazy-Loaded Views Verified:** `DeadlinesView`, `StatsView`, `DirectoryView`, and `SettingsView` are cleanly split via `React.lazy` in `src/App.tsx:63-82` into 4 separate chunks (`13.02–29.36 KiB` raw / `3.43–8.09 KiB` gz9 each). Zero heavy charting libraries are present (`StatsView` uses custom SVG).
2. **[P1] Initial Load Exceeds Bundle Budget:**
   - Target (`docs/ARCHITECTURE.md:227`, `docs/IMPLEMENTATION_PLAN.md:182`): **<= 350 KB raw / <= 115 KB gzipped initial JS**.
   - Actual: **439.78 KiB raw / 130.62 KiB gzip-9** (**+89.78 KiB raw / +15.62 KiB gzip over budget**).
3. **[P1] `framer-motion` Full Bundle Loaded Eagerly (`motion-vendor-CwVqyBkk.js` — 114.46 KiB raw / 37.89 KiB gz9):**
   - `MotionPrimitives.tsx`, `BottomNav.tsx`, `SidebarNav.tsx`, `OfflineBanner.tsx`, `ScheduleView.tsx`, `WeekStrip.tsx`, `ModalDrawer.tsx`, `SegmentedControl.tsx`, `Toast.tsx`, `AttendanceTrends.tsx`, `TeachersList.tsx`, and `ClassroomsList.tsx` import full `motion` instead of `<LazyMotion features={domAnimation}>` + `m.*`.
   - Note: `SwipeableDayContainer` (`MotionPrimitives.tsx:321-367`) uses `drag="x"`, which requires `domMax`, whereas `WeekStrip.tsx:59-77` already implements zero-dependency `onTouchStart`/`onTouchEnd` horizontal swipe in 18 lines. Replacing `motion.div drag="x"` in `SwipeableDayContainer` with lightweight pointer/touch swipe and switching to `LazyMotion` (`domAnimation`) + `m` cuts `motion-vendor` by ~18–22 KiB gzipped.
4. **[P1] `vite.config.ts` `manualChunks` Misbundles `react` into `icons-vendor` & Preloads Route-Only Icons:**
   - `vite.config.ts:9-13` defines `'icons-vendor': ['lucide-react']`, causing `<link rel="modulepreload" href="/assets/icons-vendor-BRWVq78i.js">` in `dist/index.html:48`.
   - Rollup placed `react.production.min.js` inside `icons-vendor-BRWVq78i.js` (so `react-vendor`, `motion-vendor`, and all lazy views import `react` from `icons-vendor`), and icons only used in `SettingsView`, `StatsView`, `DeadlinesView`, and `DirectoryView` are eagerly fetched on boot instead of staying inside their lazy chunks.
5. **[P2] Eager Import of `WeekGrid` and `LessonNotesDrawer` in `src/App.tsx:23-25`:**
   - Both `WeekGrid.tsx` (577 lines) and `LessonNotesDrawer.tsx` (716 lines) are eagerly bundled into `index-CkeFR5xt.js`. Lazy-loading `LessonNotesDrawer` (mounted only when `notesDrawerTarget !== null`) and `WeekGrid` (mounted only in `week` mode) further reduces initial JS.
6. **[P2] Render-Blocking Google Fonts & Oversized App Icon:**
   - `index.html:19-22` uses a synchronous `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?...">` for 3 font families (`Inter`, `JetBrains Mono`, `Literata`).
   - `dist/icons/icon-1024.png` is `573,157 B` (`559.72 KiB`) raw; `icon-192.png` + `icon-512.png` + `icon-maskable-512.png` already satisfy PWA install requirements.

---

## 2. Render & Motion Performance Audit

### 2.1 `useCurrentPair` 1-Second Re-Render Scope — **[P1]**

- **`src/App.tsx:352`**: `const currentPair = useCurrentPair(todayLessons, true);` is invoked at the root inside `AppContent`.
- **`src/hooks/useCurrentPair.ts:178-193`**: Whenever `status === 'in_lesson' || status === 'break'`, `useCurrentPair` updates `now` state **every 1,000 ms**.
- **Impact:** Because `currentPair` lives in `AppContent`, **every 1 second during class or break**:
  1. `AppContent` re-renders completely, recreating `renderedWeekStrip` (`App.tsx:504-514`), `renderedWeekGrid` (`App.tsx:516-578`), and inline closures (`() => handleShiftWeek(-1)`, `() => handleTabChange(...)`).
  2. `AppShell`, `SidebarNav`, and `BottomNav` re-render every 1 second.
  3. The entire active tab (`ScheduleView` + all `PairCard`s + `WeekStrip`/`WeekGrid`, **and even unrelated lazy tabs** `DeadlinesView`, `StatsView`, `DirectoryView`, `SettingsView`) re-renders every 1 second!
  4. Inside `WeekStrip.tsx:159-165`, `hasLessonsOnDate(date)` runs `filterLessons(getDayLessons(...))` 5–7 times on every 1-second render tick; inside `WeekGrid.tsx:307`, `getNoteCountForLesson` scans the full `notes` array for every cell on every render.

### 2.2 Memoization & Computation Audit

| Location | Observation | Severity |
| :--- | :--- | :--- |
| `src/App.tsx:342-366` | `todayLessons`, `selectedDayLessons`, `weekGrid`, `liveLessonName`/`liveStatusLabel` are properly wrapped in `useMemo`. | Pass |
| `src/App.tsx:459-463` & `WeekGrid.tsx:307` | `getNoteCountForLesson` scans `notes` linearly per grid cell instead of reading from a precomputed `Map<string, number>` keyed by `${lessonId}:${dateIso}`. | P2 |
| `src/components/schedule/WeekStrip.tsx:165` | `hasLessonsOnDate(date)` calls `filterLessons(...)` per pill on every render without memoizing per `weekDates`. | P2 |
| `src/components/schedule/ScheduleView.tsx:203-246` | `selectedNoteCountMap`, `todayNoteCountMap`, `deadlineLabelByLessonId`, `upcomingDeadlines` are properly `useMemo`-ized. | Pass |
| `src/components/deadlines/DeadlinesView.tsx:121-186` | `subjectOptions`, `counts`, `filteredDeadlines` are properly `useMemo`-ized. | Pass |
| `src/components/stats/StatsView.tsx:103-153` | `scopedRecords`, `periodRecords`, `summary`, `monthDelta`, `subjectStats`, `ringSegments` are properly `useMemo`-ized. | Pass |
| `src/components/teachers/TeachersList.tsx:51-90` & `ClassroomsList.tsx:62-113` | `slotsByTeacherId`, `filteredTeachers`, `lessonsByClassroomId`, `filteredClassrooms` are properly `useMemo`-ized. | Pass |
| `PairCard.tsx`, `WeekGrid.tsx`, `SidebarNav.tsx`, `BottomNav.tsx` | Not wrapped in `React.memo`; amplified by root 1s timer ticks. | P1 (coupled to `useCurrentPair`) |

### 2.3 `backdrop-filter` & GPU Motion Audit

- **No Continuous `backdrop-filter` Animations:** Verified across `src/index.css`, `src/lib/motion.ts`, `MotionPrimitives.tsx`, `ModalDrawer.tsx`, and `WeekGrid.tsx`. Glass blur (`blur(16px)`, `blur(18px)`, `blur(24px)`, `blur(3px)`) is strictly static CSS; only `opacity` and `transform` animate on floating glass layers.
- **GPU-Composited Primitives:**
  - `PageTransition`, `daySwitchVariants`, `staggerItemVariants`, `glassPanelVariants`, `sheetVariants`, `scrimVariants`, `amberBeaconVariants` animate only `opacity` and `transform` (`x`, `y`, `scale`).
  - `AnimatedProgressBar` (`MotionPrimitives.tsx:215-224`) animates `scaleX` (`originX: 0`) rather than `width`.
  - `AttendanceTrends.tsx:254-274` animates `scaleY` (`transformOrigin: 'bottom'`) rather than SVG `height`.
  - `StatusDot` (`Badge.tsx:159`) uses `animate-ping` (`transform` + `opacity`), disabled under reduced motion (`src/index.css:240-244`).
- **[P2] Layout-Triggering Accordion Height Animation:** `expandCollapseVariants` (`src/lib/motion.ts:273-298`, used in `TeachersList.tsx:226` and `ClassroomsList.tsx:284`) animates `height: 0 -> 'auto'`. Acceptable for click-triggered accordions, though grid-template-rows (`0fr -> 1fr`) or `opacity`/`y` avoids layout thrash.
- **[P2] Broad `transition-all` Classes:** 14 usages of `transition-all` (e.g., `PairCard.tsx:234`, `LivePairHero.tsx:256`, `DeadlinesView.tsx:326,428,446`, `WeekGrid.tsx:330`) should be narrowed to `transition-[transform,colors,box-shadow]` or `transition-colors` so unintended layout properties are never transitioned.

---

## 3. Accessibility (WCAG 2.1 AA) Audit

### 3.1 Color Contrast Analysis (WCAG 2.1 SC 1.4.3 & SC 1.4.11)

Computed using exact WCAG 2.1 relative luminance formulas against both solid surfaces and alpha-blended tinted/glass backgrounds from `src/index.css`:

#### Dark Theme (`:root, [data-theme="dark"]`)

| Token / Combination | Foreground | Background | Contrast | WCAG AA (4.5:1 text / 3.0:1 UI) | Affected Usage |
| :--- | :--- | :--- | ---: | :--- | :--- |
| `text-ink` on canvas / surface / elevated | `#F0EEE8` | `#242522` / `#30312D` / `#393A35` | **13.28 / 11.29 / 9.89** | PASS (AAA) | Primary headings & text |
| `text-ink-secondary` on canvas / surface / elevated | `#A8A69E` | `#242522` / `#30312D` / `#393A35` | **6.32 / 5.37 / 4.71** | PASS | Secondary labels, teacher names, inactive tabs |
| `text-ink-secondary` on glass / glass-strong | `#A8A69E` | blended on `#242522` | **5.64 / 4.95** | PASS | Header, BottomNav, SidebarNav, ModalDrawer |
| **`text-ink-muted` on canvas / surface / elevated** | `#7C7A73` | `#242522` / `#30312D` / `#393A35` | **3.59 / 3.05 / 2.67** | **FAIL (P1)** | `LivePairHero:208,330`, `WeekGrid:190,234,266`, `LessonNotesDrawer:496`, `TeachersList:239`, `ClassroomsList:297`, `StatsView:228,330,331`, `AttendanceCalculator:117`, `AttendanceTrends:357`, `SettingsView:376`, all `placeholder:text-ink-muted` |
| `amber-fg` on canvas / surface / elevated | `#E39C5B` | `#242522` / `#30312D` / `#393A35` | **6.73 / 5.72 / 5.01** | PASS | Active accents, kickers |
| `amber-fg` on `amber-soft` (over surface `#30312D`) | `#E39C5B` | `rgba(216,139,69,0.14)` on `#30312D` | **4.60** | PASS | `MetaChip variant="amber"` on matte surface |
| **`amber-fg` on `amber-soft` (over elevated `#393A35`)** | `#E39C5B` | `rgba(216,139,69,0.14)` on `#393A35` | **4.08** | **FAIL (P1)** | `SettingsView:215,301` active chips/buttons on elevated |
| `terracotta-fg` on canvas / surface / elevated | `#E38D6E` | `#242522` / `#30312D` / `#393A35` | **6.09 / 5.18 / 4.53** | PASS | Solid surface terracotta text |
| **`terracotta-fg` on `terracotta-soft` (over surface / elevated)** | `#E38D6E` | `rgba(215,123,89,0.14)` on `#30312D` / `#393A35` | **4.25 / 3.77** | **FAIL (P1)** | `MetaChip variant="terracotta"`, `LessonTypeBadge` "Практична", `DeadlinesView:525,529`, `BackupSection:367,391,480,498`, `StatsView:401,183` |
| `sage-fg` on surface / `sage-soft` | `#B8C3AE` | `#30312D` / `sage-soft` | **7.15 / 5.44** | PASS | `MetaChip`, `LessonTypeBadge` "Лабораторна" |
| `beige-fg` on surface / `beige-soft` | `#D8CBB8` | `#30312D` / `beige-soft` | **8.21 / 6.18** | PASS | `MetaChip`, `LessonTypeBadge` "Лекція" |
| Active Attendance (`present` / `absent` / `excused`) | `#242522` | `#AAB5A0` / `#D77B59` / `#D88B45` | **7.21 / 5.04 / 5.65** | PASS | `PairCard`, `LivePairHero`, `WeekGrid` |
| `text-on-accent` on `bg-amber` / `bg-terracotta` | `#242522` | `#D88B45` / `#D77B59` | **5.65 / 5.04** | PASS | `OfflineBanner:85`, `BottomNav:101` |

#### Light Theme (`[data-theme="light"]`)

| Token / Combination | Foreground | Background | Contrast | WCAG AA (4.5:1 text / 3.0:1 UI) | Affected Usage |
| :--- | :--- | :--- | ---: | :--- | :--- |
| `text-ink` on canvas / surface / elevated | `#292A28` | `#F2F0EB` / `#FAF9F6` / `#E9E7E1` | **12.66 / 13.70 / 11.66** | PASS (AAA) | Primary headings & text |
| **`text-ink-secondary` on canvas / surface / elevated / glass** | `#77766F` | `#F2F0EB` / `#FAF9F6` / `#E9E7E1` / glass | **4.00 / 4.33 / 3.69 / 4.26** | **FAIL (P0)** | **Pervasive failure** across all body metadata, teacher names, timestamps, inactive nav tabs, descriptions, and buttons |
| **`text-ink-muted` on canvas / surface / elevated / glass** | `#98968E` | `#F2F0EB` / `#FAF9F6` / `#E9E7E1` / glass | **2.60 / 2.81 / 2.40 / 2.77** | **FAIL (P0)** | Unreadable sub-3:1 labels (`WeekGrid` corner/counts/endTime, `LivePairHero`, `StatsView`, `SettingsView`, `TeachersList`, `ClassroomsList`, placeholders) |
| **`text-on-accent` on `bg-amber` (`OfflineBanner:85`)** | `#FAF9F6` | `#D88B45` | **2.59** | **FAIL (P0)** | "Оновити" primary CTA button in update banner |
| **`text-on-accent` on `bg-terracotta` (`BottomNav:101`)** | `#FAF9F6` | `#D77B59` | **2.90** | **FAIL (P0)** | Active deadlines count badge in `BottomNav` |
| **`status-excused-fg` on `status-excused-bg`** | `#FAF9F6` | `#C47630` | **3.33** | **FAIL (P0)** | Active "Поважна" attendance button in `PairCard`, `LivePairHero`, `WeekGrid` |
| `status-present-fg` / `status-absent-fg` on bg | `#FAF9F6` | `#5B6D50` / `#B85634` | **5.32 / 4.51** | PASS | Active "Був" / "Н-ка" buttons |
| **`amber-fg` on canvas / elevated / `amber-soft` (surface / elevated)** | `#A85F1D` | `#F2F0EB` / `#E9E7E1` / `amber-soft` | **4.27 / 3.93 / 4.09 / 3.54** | **FAIL (P1)** | View kickers on canvas, `AppShell` icon on elevated, `MetaChip variant="amber"`, `LessonNotesDrawer` links, `SettingsView` active items (only passes on plain `#FAF9F6` at **4.62:1**) |
| **`terracotta-fg` on elevated / `terracotta-soft` / `badge-practice-bg`** | `#AC4F2E` | `#E9E7E1` / `terracotta-soft` / `badge-practice-bg` | **4.34 / 4.46 / 4.37** | **FAIL (P1)** | `MetaChip variant="terracotta"`, `LessonTypeBadge` "Практична", `DeadlinesView` overdue badges, `BackupSection` danger actions (passes on `#F2F0EB` 4.71 & `#FAF9F6` 5.10) |
| `sage-fg` on canvas / surface / elevated / `sage-soft` / `badge-lab-bg` | `#4E5E43` | `#F2F0EB` / `#FAF9F6` / `#E9E7E1` / soft | **6.13 / 6.64 / 5.65 / 5.76 / 5.65** | PASS | `MetaChip`, `LessonTypeBadge` "Лабораторна" |
| `beige-fg` / `badge-lecture-fg` on canvas / surface / elevated / soft | `#63584A` / `#5F5446` | `#F2F0EB` / `#FAF9F6` / `#E9E7E1` / soft | **5.61–7.02** | PASS | `MetaChip`, `LessonTypeBadge` "Лекція" |
| **Non-text UI graphics on `#FAF9F6` (`SC 1.4.11 >= 3.0:1`)** | `#D88B45` / `#D77B59` / `#AAB5A0` | `#FAF9F6` | **2.59 / 2.90 / 2.03** | **FAIL (P1)** | `StatsView` radial ring segments, `AttendanceTrends` bars & dashed goal line, `AnimatedProgressBar`, `SettingsView`/`StatsView` switch tracks |

### 3.2 Landmarks, Skip Link & Heading Hierarchy

- **Landmarks:**
  - `<header>` (`AppShell.tsx:83`), `<main id="main-content" tabIndex={-1}>` (`AppShell.tsx:123-126`), `<aside aria-label="Бічна навігація">` + `<nav aria-label="Розділи додатку">` (`SidebarNav.tsx:122,151`), `<nav aria-label="Мобільна навігація">` (`BottomNav.tsx:59`).
  - Skip-to-content link `<a href="#main-content">Перейти до вмісту</a>` (`AppShell.tsx:61-66`) becomes visible on keyboard focus (`focus:not-sr-only`).
  - Minor: `ScheduleView.tsx:453` renders `<aside>` inside `<main>` without an `aria-label`.
- **[P1] Heading Hierarchy Violations:**
  - `AppShell.tsx:98` always renders `<h1>` inside `<header>`.
  - `ScheduleView.tsx:334`, `DeadlinesView.tsx:317`, and `DirectoryView.tsx:52` each render a **second `<h1>`** inside `<main>` (while `StatsView.tsx:165` and `SettingsView.tsx:167` correctly use `<h2>`).
  - Furthermore, `DeadlinesView` (`<h1>` at `:317` -> `<h3>` at `:545` / `EmptyState:59`) and `DirectoryView` (`<h1>` at `:52` -> `<h3>` at `TeachersList:184`, `ClassroomsList:242`, `EmptyState:59`) **skip `<h2>`**.

### 3.3 Keyboard Navigation, Focus Indicators, ARIA & Viewport

- **Pinch-to-Zoom (`index.html:5`, `public/offline.html:5`):** Uses `width=device-width, initial-scale=1.0, viewport-fit=cover` — no `maximum-scale=1.0` or `user-scalable=no`. **PASS**.
- **Icon-Only Buttons:** All verified icon-only buttons (`AppShell:107`, `OfflineBanner:90`, `App:524,535`, `ScheduleView:355,364`, `WeekStrip:129,137`, `PairCard:247`, `LessonNotesDrawer:543,551`, `DeadlinesView:365,435,507,515`, `StatsView:183,194`, `TeachersList:109`, `ClassroomsList:133`, `ModalDrawer:243`, `Toast:154`) have descriptive `aria-label`s. **PASS**.
- **Active Nav & Toggles:**
  - `SidebarNav.tsx:166` and `BottomNav.tsx:73` set `aria-current={isActive ? 'page' : undefined}`.
  - `WeekStrip.tsx:172` sets `aria-current={isSelected ? 'date' : undefined}` (note: line 100 also sets `aria-current="date"` on a non-interactive "Сьогодні" `<span>`, which is harmless/redundant).
  - `SegmentedControl.tsx` (`role="radiogroup"` / `role="radio"` / `aria-checked` / roving `tabIndex` / Arrow+Home+End keys), `SettingsView.tsx` (`role="radiogroup"`, `role="switch"`), `StatsView.tsx` (`role="switch"`), `DeadlinesView.tsx` (`role="checkbox"`), `PairCard.tsx` / `LivePairHero.tsx` / `WeekGrid.tsx` / `AttendanceCalculator.tsx` / `ClassroomsList.tsx` (`aria-pressed`), and `AttendanceTrends.tsx` (`role="button"`, `tabIndex={0}`, ArrowLeft/Right/Enter/Space/Escape) are properly implemented. **PASS**.
- **[P0/P1] Stripped `:focus-visible` Outlines (WCAG 2.1 SC 2.4.7 — Focus Visible):**
  - `src/index.css:176-179` defines `:focus-visible { outline: 2px solid var(--accent-amber); outline-offset: 2px; }`.
  - **However**, `SegmentedControl.tsx:107` (`focus-visible:outline-none`), `WeekGrid.tsx:209` (`focus-visible:outline-none` on day column header buttons), and `WeekGrid.tsx:330` (`focus-visible:outline-none` on timetable cell buttons) **remove the outline without any `focus-visible:ring-*` replacement**, leaving keyboard users with zero visible focus indicator on segmented tabs and the entire desktop week grid.
  - Additionally, form inputs (`DeadlinesView`, `LessonNotesDrawer`, `TeachersList`, `ClassroomsList`, `SettingsView`, `BackupSection`) use `focus:border-amber focus:outline-none`, which in Light mode (`#D5D2CA` -> `#D88B45`) changes border color by only ~1.8:1 contrast without a 2px ring.
- **Modal Focus Trap & Escape (`ModalDrawer.tsx:93-151`):**
  - Traps `Tab` / `Shift+Tab` within visible focusables, closes on `Escape` (`e.stopPropagation()`), locks body scroll with scrollbar compensation, restores focus to `previousFocusRef.current` on close, and provides `role="dialog" aria-modal="true" aria-labelledby/aria-describedby`. **PASS**.

### 3.4 `prefers-reduced-motion` Coverage

- **Framer Motion Root Config:** `src/App.tsx:724` wraps the app in `<AppMotionProvider>` -> `<MotionConfig reducedMotion="user">` (`MotionPrimitives.tsx:45-47`).
- **CSS Fallback:** `src/index.css:229-245` overrides transitions to `opacity, color, background-color, border-color` at `120ms`, sets `scroll-behavior: auto !important`, clamps `animation-duration: 0.01ms !important`, and disables `.animate-pulse`, `.animate-ping`, `.animate-bounce`.
- **Component-Level Guards:** `MotionPrimitives.tsx`, `BottomNav.tsx`, `SidebarNav.tsx`, `OfflineBanner.tsx`, `ScheduleView.tsx`, `WeekStrip.tsx`, `TeachersList.tsx`, `ClassroomsList.tsx`, `StatsView.tsx`, `AttendanceTrends.tsx`, `ModalDrawer.tsx`, `SegmentedControl.tsx`, and `Toast.tsx` all respect `useReducedMotion()` / `useAppReducedMotion()`. **PASS**.

---

## 4. PWA Cache & Update Safety Audit (`public/sw.js`, `vercel.json`, `index.html`, `useOnlineStatus.ts`)

### 4.1 Verified Safe Behaviors

- **`vercel.json` Caching & SPA Rewrite Safety:**
  - `/sw.js`: `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /`.
  - `/manifest.json` & `/offline.html`: `public, max-age=0, must-revalidate`.
  - `/assets/(.*)`: `public, max-age=31536000, immutable`.
  - `/icons/(.*)`: `public, max-age=604800, stale-while-revalidate=86400`.
  - SPA rewrite (`vercel.json:58-63`) excludes `icons/`, `assets/`, `sw.js`, `manifest.json`, `offline.html`, `favicon.ico` — preventing missing hashed `/assets/*.js` chunks from receiving `index.html` with `text/html` MIME type.
- **`public/sw.js` Routing Strategies:**
  - Navigation / HTML requests (`isNavigationRequest`, lines `53-88`) use **network-first** (`handleNavigation`), caching successful HTML responses in `SHELL_CACHE` and falling back to exact match -> `'/'` -> `/offline.html`.
  - Hashed Vite `/assets/*` (`sw.js:184-187`) use **cache-first** (`cacheFirst`) and only cache responses where `response.ok || response.type === 'opaque'`.
  - `/sw.js` itself is never intercepted (`sw.js:173-175`).
  - `activate` cleans up old `rozklad-*` cache versions (`sw.js:36-41`).

### 4.2 Identified Update & Offline Safety Issues

1. **[P1] Unconditional `self.skipWaiting()` in `install` (`public/sw.js:28`) Breaks Controlled Update Prompt:**
   - `public/sw.js:28` calls `await self.skipWaiting()` during `install`, and `activate` (`sw.js:42`) calls `await self.clients.claim()`.
   - Meanwhile, `index.html:91-95` calls `registration.update()` on `visibilitychange`, and `src/hooks/useOnlineStatus.ts:49-53` calls `window.location.reload()` whenever `controllerchange` fires.
   - **Consequence:** Whenever a new `sw.js` is deployed and a user returns to an already-open tab, the new SW skips waiting immediately, claims the client, fires `controllerchange`, and **force-reloads the page mid-session** without waiting for the user to click "Оновити" in `OfflineBanner` (potentially discarding unsaved form input in `LessonNotesDrawer` or `DeadlinesView`).
2. **[P1] `PRECACHE_URLS` Omits `'/'` (`public/sw.js:7-14`) — First-Visit Offline Gap:**
   - On a user's first visit, `'/'` and the initial `/assets/*.js` + `/assets/*.css` are fetched before the SW controls the page. Because `PRECACHE_URLS` only lists `/offline.html`, `/manifest.json`, and 4 icons, closing the tab and reopening offline without a second online navigation leaves `shellCache.match('/')` empty and shows `/offline.html` instead of the app shell.

---

## 5. Concrete Remediation Backlog (P0 & P1 Fixes)

### P0 — Must Fix Before Release (WCAG AA Contrast Blockers)

1. **Fix Light Theme Text & Accent Contrast (`src/index.css:85-158`) & `text-on-accent` (`OfflineBanner.tsx:85`, `BottomNav.tsx:101`):**
   - Darken Light `--text-secondary` (also `--rgb-text-secondary`) from `#77766F` to `#5D5C56` (`5.88:1` on `#F2F0EB`, `6.36:1` on `#FAF9F6`, `5.41:1` on `#E9E7E1`).
   - Darken Light `--text-muted` from `#98968E` to `#67655F` (`5.07:1` on `#F2F0EB`, `5.48:1` on `#FAF9F6`, `4.66:1` on `#E9E7E1`).
   - Darken Light `--status-excused-bg` from `#C47630` to `#9B5618` (with `#FAF9F6` -> `5.33:1`) OR switch `--status-excused-fg` / `--text-on-accent` in Light mode to `#242522` (matching Dark mode & `DeadlinesView`/`App.tsx` buttons: `#242522` on `#D88B45` = `5.65:1`, on `#D77B59` = `5.04:1`, on `#C47630` = `4.54:1` — check `#C47630` or `#D88B45` for `5.65:1`!).
   - Darken Light `--accent-amber-fg` from `#A85F1D` to `#8C4B10` (`5.79:1` on `#F2F0EB`, `6.27:1` on `#FAF9F6`, `5.33:1` on `#E9E7E1`, `5.55:1` on `amber-soft`).
   - Darken Light `--accent-terracotta-fg` & `--badge-practice-fg` from `#AC4F2E` to `#973E1F` (`5.67:1` on `#FAF9F6` / `> 4.9:1` on `terracotta-soft` & `#E9E7E1`).
2. **Fix Focus-Visible Indicators (`SegmentedControl.tsx:107`, `WeekGrid.tsx:209,330`):**
   - Remove `focus-visible:outline-none` or replace with `focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-1 focus-visible:ring-offset-surface` so keyboard focus is always clearly visible.

### P1 — High-Priority Performance, Contrast, Semantics & PWA Fixes

3. **Fix Dark Theme `text-ink-muted` & `terracotta-fg` Soft-Surface Contrast (`src/index.css:36,44,70`):**
   - Lighten Dark `--text-muted` from `#7C7A73` to `#97958D` (`5.14:1` on `#242522`, `4.37:1` on `#30312D` — or `#9C9A92` for `5.50:1` on `#242522`, `4.68:1` on `#30312D`, `4.10:1` on `#393A35`; use `#A09E96` for `4.95:1` on `#30312D` / `4.52:1` on `#393A35`? Better: `#A2A098` gives `>= 4.5:1` even on `#393A35`!).
   - Lighten Dark `--accent-terracotta-fg` / `--badge-practice-fg` from `#E38D6E` to `#ECA084` (`>= 4.8:1` on `terracotta-soft` over `#30312D` and `>= 4.5:1` on `#393A35`) and `--accent-amber-fg` from `#E39C5B` to `#EAA96D` (`>= 4.6:1` on `amber-soft` over `#393A35`).
   - Adjust Light theme non-text graphics (`StatsView` ring, `AttendanceTrends` bars/line, `AnimatedProgressBar`) to use contrast-safe fills (`>= 3.0:1` against `#FAF9F6`, e.g., `#728466` for Sage, `#B86A22` for Amber, `#BD5C39` for Terracotta) when in Light mode.
4. **Bring Initial JS Bundle Under Budget (`<= 350 KB raw / <= 115 KB gzipped`):**
   - Migrate `AppMotionProvider` (`src/components/motion/MotionPrimitives.tsx`) from `MotionConfig` + full `motion` to `<LazyMotion features={domAnimation} strict>` + `m.*` components, and replace `motion.div drag="x"` in `SwipeableDayContainer` with lightweight `onTouchStart`/`onTouchEnd` swipe (matching `WeekStrip.tsx`).
   - Remove `'icons-vendor': ['lucide-react']` from `vite.config.ts:12` so route-specific icons stay in lazy chunks and `react` stays cleanly inside `react-vendor`.
   - Lazy-load `LessonNotesDrawer` and `WeekGrid` via `React.lazy` in `src/App.tsx`.
5. **Isolate 1-Second `useCurrentPair` Timer Scope (`src/App.tsx:352`, `src/hooks/useCurrentPair.ts`):**
   - Decouple the 1-second countdown tick (`remainingSeconds`, `secondsUntilNext`, `progressPercent`) into `LivePairHero` (or a dedicated timer hook/context consumed only by `LivePairHero`), while `AppContent` only tracks lesson/status transitions (`status`, `currentLesson?.id`, `nextLesson?.id` checked at boundary transitions / 30s). Eliminates ~60 unnecessary full-app re-renders per minute across all views.
6. **Fix Heading Hierarchy (`ScheduleView.tsx:334`, `DeadlinesView.tsx:317`, `DirectoryView.tsx:52`):**
   - Change view-level `<h1>` in `ScheduleView`, `DeadlinesView`, and `DirectoryView` to `<h2>` (matching `StatsView` & `SettingsView`, since `AppShell.tsx:98` already renders the page `<h1>`), OR promote view headings to the sole `<h1>` and change `AppShell.tsx:98` to `<p>`/`<div>`. Ensure `EmptyState` / card headings step cleanly (`h2` -> `h3`).
7. **Fix Service Worker Controlled Update & Cold Offline Precache (`public/sw.js`):**
   - Remove `await self.skipWaiting();` from `install` (`public/sw.js:28`) so new SW versions wait in `waiting` state and trigger `OfflineBanner`'s "Доступне оновлення версії" -> "Оновити" (`SKIP_WAITING` message) instead of force-reloading active sessions.
   - Precache `'/'` (and optionally `index.html`) in `PRECACHE_URLS` (`public/sw.js:7-14`) so single-visit-then-offline cold boots render the cached app shell rather than `/offline.html`.
