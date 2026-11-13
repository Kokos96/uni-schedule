# GRAPHITE GLASS — Design System Specification (`uni-schedule 2.0`)

> **Design Direction:** Editorial minimalism meets layered frosted glass and warm amber illumination. Inspired by Claude / Claude Code's calm, tactile graphite-and-parchment typography paired with selective glassmorphic depth.
> **Scope:** Complete visual, typographic, component, layout, and token specification for **Phase Two** implementation across `index.html`, `tailwind.config.js`, `src/index.css`, and `src/components/**`.

---

## 1. Design Principles

1. **Calm Editorial Hierarchy** — The timetable is a daily cognitive tool, not an arcade dashboard. Warm off-white/charcoal text on matte mineral surfaces keeps eye strain near zero during 08:30 lectures and 21:00 evening labs.
2. **Selective Glassmorphism** — Blur and translucency are reserved for *floating, active, or navigational planes* (nav dock/rail, live timer widget, floating week strip, selected cards, dialogs, context menus). Standard content cards stay crisp and matte so text never fights noisy backgrounds.
3. **Warm Amber as Signal, Not Noise** — `#D88B45` signals *now*, *focus*, and *primary interaction*. Everything else speaks in restrained mineral tones (`#AAB5A0` Sage, `#D77B59` Terracotta, `#D8CBB8` Muted Beige).
4. **Dual-Polarity Parity** — Dark mode (`Graphite`) and Light mode (`Warm Parchment`) are first-class themes with matched elevation logic, contrast-verified foreground tokens, and explicit `color-scheme` support.
5. **Ukrainian-First Typography & Precision Mono** — Full Cyrillic glyph coverage (`ґ`, `є`, `і`, `ї`, apostrophes) paired with `tabular-nums` monospace exclusively for time ranges, pair numbers, room codes, and countdowns.

---

## 2. Color System & Semantic Tokens

### 2.1 Core Palette

| Role | Dark Theme (`Graphite`) | Light Theme (`Parchment`) | Usage |
| :--- | :--- | :--- | :--- |
| **Canvas Background** | `#242522` | `#F2F0EB` | App root background, behind glass layers |
| **Primary Surface** | `#30312D` | `#FAF9F6` | Standard cards (`PairCard`), list containers, settings groups |
| **Elevated / Secondary Surface** | `#393A35` | `#E9E7E1` | Hover states, nested pills, segmented control tracks, table headers |
| **Borders** | `#4A4B45` | `#D5D2CA` | Hairline `1px` structural dividers and card outlines |
| **Primary Text** | `#F0EEE8` | `#292A28` | Lesson titles, headings, primary labels, values |
| **Secondary Text** | `#A8A69E` | `#77766F` | Teacher names, timestamps, metadata, inactive tabs |

### 2.2 Accent Palette & Contrast-Safe Foreground Variants

Core brand accents retain their exact hue across themes, while text/icon foreground tokens adjust slightly on Light Parchment to guarantee **WCAG 2.1 AA (≥ 4.5:1)** contrast for small labels (`11px–13px`).

| Accent | Core Hex | Dark Mode (`on #242522 / #30312D`) | Light Mode (`on #F2F0EB / #FAF9F6`) | Semantic Role |
| :--- | :--- | :--- | :--- | :--- |
| **Warm Amber** | `#D88B45` | Fill/Border `#D88B45` · Text `#E39C5B` | Fill/Border `#D88B45` · Text `#A85F1D` | Active nav, live pair pulse, primary CTA, current day highlight, focus ring |
| **Terracotta** | `#D77B59` | Fill/Border `#D77B59` · Text `#E38D6E` | Fill/Border `#D77B59` · Text `#AC4F2E` | `absent` ("Н-ка"), urgent deadlines, `Практична` accent, destructive actions |
| **Sage** | `#AAB5A0` | Fill/Border `#AAB5A0` · Text `#B8C3AE` | Fill/Border `#AAB5A0` · Text `#536348` | `present` ("Був"), `Лабораторна` accent, completed tasks, positive trend |
| **Muted Beige** | `#D8CBB8` | Fill `#D8CBB8` (`#242522` ink) · Text `#D8CBB8` | Fill `#E5DDD0` (`#292A28` ink) · Text `#685D4E` | `Лекція` editorial badge, `excused` ("Поважна") neutral-warm pairing, elective/tag chips |

> **Contrast Check:** On `#FAF9F6`, raw `#AAB5A0` has ~2.0:1 contrast (unreadable as small text) and `#D88B45` has ~2.6:1. Therefore, `#AAB5A0` and `#D88B45` are used as *tints, borders, progress fills, and icon strokes on dark/tinted badges*, while text labels inside light-mode badges always use the darkened `*-fg` tokens (`#536348`, `#A85F1D`, `#AC4F2E`, `#685D4E`).

---

## 3. Domain Semantics Mapping

Covers all existing data structures in `src/types/index.ts`, `src/data/schedule.json`, `teachers.json`, `classrooms.json`, and 2.0 features.

### 3.1 Lesson Types (`LessonType`)

Each lesson type is distinguished by **badge tint + micro-glyph/border style** (never relying on color alone):

| `LessonType` | Accent Family | Badge Surface (Dark / Light) | Badge Border & Text | Visual Cue |
| :--- | :--- | :--- | :--- | :--- |
| **Лекція** | Muted Beige | `rgba(216, 203, 184, 0.12)` / `rgba(216, 203, 184, 0.35)` | `1px solid` `--border-lecture` · `--fg-lecture` (`#D8CBB8` / `#5F5446`) | Open book / solid left hairline on week grid |
| **Практична** | Terracotta | `rgba(215, 123, 89, 0.14)` / `rgba(215, 123, 89, 0.16)` | `1px solid` `--border-practice` · `--fg-practice` (`#E38D6E` / `#AC4F2E`) | Pen/terminal mark / dashed-amber accent |
| **Лабораторна** | Sage | `rgba(170, 181, 160, 0.14)` / `rgba(170, 181, 160, 0.24)` | `1px solid` `--border-lab` · `--fg-lab` (`#B8C3AE` / `#4E5E43`) | Flask/beaker mark / double-dot subgroup indicator |

### 3.2 Attendance States (`AttendanceStatus`)

| State | UI Label | Icon (`lucide-react`) | Unselected Button | Active Button (Dark) | Active Button (Light) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `present` | `Був` | `Check` | Surface-elevated, `--text-secondary` | Bg `#AAB5A0`, Text `#242522`, Glow `0 4px 14px rgba(170,181,160,0.22)` | Bg `#5B6D50`, Text `#FAF9F6`, Shadow soft |
| `absent` | `Н-ка` | `X` | Surface-elevated, `--text-secondary` | Bg `#D77B59`, Text `#242522`, Glow `0 4px 14px rgba(215,123,89,0.24)` | Bg `#B85634`, Text `#FAF9F6`, Shadow soft |
| `excused` | `Поважна` | `Clock` | Surface-elevated, `--text-secondary` | Bg `#D88B45`, Text `#242522`, Glow `0 4px 14px rgba(216,139,69,0.24)` | Bg `#C47630`, Text `#FAF9F6`, Shadow soft |
| `null` | *(не відмічено)* | — | Dashed or hairline neutral border | N/A | N/A |

### 3.3 Departments, Subgroups, Electives & Week Parity

- **Departments (`sp`, `oit`, `rks`, `rkt`)**:
  - Rendered in Header context pill (`ФЕП-33с · СП · ПІДГР. 1`) using monospace uppercase (`11px`, `letter-spacing: 0.06em`) and in Settings as radio cards with Warm Amber active indicator dot (`8px` circle + outer `rgba(216, 139, 69, 0.22)` halo).
  - On department-specific lessons (`departments?: DepartmentType[]`, e.g. NoSQL for `sp`/`oit`, C for `rks`/`rkt`), show a quiet secondary chip: `СП / ОІТ` or `РКС / РКТ` in `--bg-surface-elevated` with `--text-secondary`.
- **Subgroups (`subgroup?: 1 | 2`)**:
  - Compact pill `Підгр. 1` / `Підгр. 2` in monospace (`10.5px`), `--bg-surface-elevated`, border `--border-subtle`, text `--accent-beige` (dark) / `--text-primary` (light).
  - In **Week Grid**, when viewing unfiltered/overlapping pairs or switching subgroups, paired subgroup slots share a row split `50% / 50%` with a `1px` vertical hairline divider.
- **Electives (`isElective`, `electiveKey`: `freelance` | `management` | `space` | `both`)**:
  - Subtle editorial badge `Вибіркова` with `Sparkles` or `Bookmark` (`11px` icon) and Warm Amber `1px` tinted border (`rgba(216,139,69,0.28)`).
- **Week Parity (`weekType`: `numerator` | `denominator` | `both`)**:
  - Displayed in the Week Strip header & Week Grid header as a compact mono pill: `Чисельник` (up-triangle `▲`) or `Знаменник` (down-triangle `▼`) when applicable; lessons restricted to one parity show an inline `Чис.` / `Знам.` micro-tag.
- **Classrooms (`Classroom`)**:
  - Code (`№14/Б`, `302/l`, `130/Т`) rendered in **monospace medium** (`--text-primary`), building (`вул. Драгоманова`, `вул. Тарнавського`, `Головний корпус`) and optional floor (`1 пов.`) in regular UI sans (`--text-secondary`).

---

## 4. Selective Glassmorphism Specification

### 4.1 Surface Matrix (Where Glass Applies vs. Matte)

| Component / Surface | Treatment | Rationale |
| :--- | :--- | :--- |
| **Bottom Navigation Dock (Mobile)** | **Glass Strong** | Floats over scrolling timetable; reveals subtle movement underneath |
| **Desktop Navigation Rail / Header Bar** | **Glass Base** | Anchors chrome while preserving workspace depth |
| **Floating Controls** (Sticky Date Strip, "Сьогодні" pill, View Switcher) | **Glass Base** | Separates persistent controls from scrolling cards |
| **Live Current Lesson Widget** (Timer Card) | **Glass Amber-Lit** | Hero focal point; frosted glass + subtle `#D88B45` top-edge illumination |
| **Selected Cards / Active Day Chip** | **Glass Amber-Lit** | Tactile lift distinguishing selected state from matte siblings |
| **Dialogs, Bottom Sheets, Context Menus, Popovers** | **Glass Strong + Scrim** | Highest z-layer (`z-40`/`z-50`), clear separation from dimmed canvas |
| Standard `PairCard`, `StatsView` sub-cards, `TeacherCard`, `Settings` groups | **Matte Primary Surface** | Maximum text sharpness, zero GPU overdraw during fast scrolling |

### 4.2 CSS Glass Recipes

1. **Glass Base (`--surface-glass`)**:
   - **Dark:** `background: rgba(48, 49, 45, 0.72);` · `border: 1px solid rgba(240, 238, 232, 0.10);`
   - **Light:** `background: rgba(250, 249, 246, 0.76);` · `border: 1px solid rgba(41, 42, 40, 0.10);`
   - **Filter:** `backdrop-filter: blur(16px) saturate(135%); -webkit-backdrop-filter: blur(16px) saturate(135%);`
   - **Specular Inner Edge:** `box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px -8px rgba(0, 0, 0, 0.28);` (Light shadow: `0 8px 24px -8px rgba(41, 42, 40, 0.10)`)

2. **Glass Strong (`--surface-glass-strong` — Nav Dock, Modals, Context Menus)**:
   - **Dark:** `background: rgba(57, 58, 53, 0.84);` · `border: 1px solid rgba(240, 238, 232, 0.14);`
   - **Light:** `background: rgba(250, 249, 246, 0.88);` · `border: 1px solid rgba(41, 42, 40, 0.12);`
   - **Filter:** `backdrop-filter: blur(24px) saturate(150%); -webkit-backdrop-filter: blur(24px) saturate(150%);`

3. **Glass Amber-Lit (Current Lesson Widget & Selected Card)**:
   - Base glass layer + top-left subtle radial amber wash:
     `background-image: radial-gradient(120% 90% at 10% 0%, rgba(216, 139, 69, 0.14) 0%, transparent 60%);`
   - Border: `1px solid rgba(216, 139, 69, 0.42);`
   - Outer glow: `0 10px 30px -10px rgba(216, 139, 69, 0.20), inset 0 1px 0 rgba(216, 139, 69, 0.18);`

4. **Fallback (`@supports not (backdrop-filter: blur(1px))`)**:
   - Use opaque `--bg-surface-elevated` (`#393A35` dark / `#FAF9F6` light) so contrast never degrades on older webviews.

---

## 5. Typography System

### 5.1 Font Families (Full Ukrainian Cyrillic Support)

1. **Primary UI & Headings (`--font-sans`)**: `'Inter', -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', system-ui, sans-serif`
   - Clean neo-grotesque proportions, full Ukrainian Cyrillic (`А–Я, а–я, Ґ, ґ, Є, є, І, і, Ї, ї`), sharp diacritics at `11px–13px`.
2. **Editorial Serif Accent (`--font-serif`, selective)**: `'Literata', Georgia, 'Times New Roman', serif`
   - Used *sparingly* for editorial empty-state titles, semester overview hero kicker, and quote-style day summaries to evoke Claude's warm editorial character. Never used for dense schedule metadata.
3. **Precision Monospace (`--font-mono`, selective)**: `'JetBrains Mono', 'SF Mono', ui-monospace, Menlo, Consolas, monospace`
   - Used *exclusively* for:
     - Pair order badges (`01`–`08`)
     - Time intervals (`08:30 – 09:50`) and Live Timer countdown (`24:18`)
     - Classroom codes (`№14/Б`, `302/l`)
     - Hero & subject attendance percentages (`94%`)
     - Header metadata kicker (`ФЕП-33с · СП · ПІДГР. 1`)
   - Always apply `font-variant-numeric: tabular-nums;` on numerical/time readouts to prevent jitter during live countdown ticks.

### 5.2 Google Fonts Loading (`index.html`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link
  href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Literata:opsz,wght@7..72,500;7..72,600&display=swap"
  rel="stylesheet"
/>
```

### 5.3 Type Scale

| Token | Size / Line-Height | Weight | Tracking | Font | Usage |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `display-stat` | `44px / 1.05` (`2.75rem`) | `700` | `-0.03em` | `mono` (`tabular-nums`) | Overall attendance `%` in `StatsView` |
| `page-title` | `22px / 1.25` (`1.375rem`) | `700` | `-0.02em` | `sans` (or `serif` on Desktop hero) | View headings ("Розклад занять", "Відвідуваність") |
| `section-title` | `16px / 1.35` (`1rem`) | `600` | `-0.015em` | `sans` | Lesson card titles (`lesson.name`), modal titles |
| `editorial-empty` | `18px / 1.35` (`1.125rem`) | `500` | `-0.01em` | `serif` | Empty-state headline ("Пар немає — вільний день") |
| `body` | `14px / 1.5` (`0.875rem`) | `400–500` | `-0.005em` | `sans` | Teacher names, notes body, settings descriptions |
| `meta` | `12px / 1.4` (`0.75rem`) | `500` | `0em` | `sans` / `mono` | Classroom location, attendance buttons, week dates |
| `micro-kicker` | `10.5px / 1.2` (`0.656rem`) | `600` | `0.06em` | `mono` | Uppercase kickers (`ФЕП-33С · СП`), nav tab labels, badges |

---

## 6. Editorial Hand-Drawn Details

All custom ornaments follow an **architectural drafting / fountain-pen** aesthetic: geometric precision, single-weight strokes (`1.25px`–`1.5px`), `stroke-linecap="round"`, `stroke-linejoin="round"`, and `vector-effect="non-scaling-stroke"`. No thick cartoon outlines or bouncy comic shapes.

### 6.1 Inline Structural Ornaments

1. **Drafted Underline (`EditorialUnderline`)**:
   - Placed beneath active view/day titles or featured stat numbers (`width: 64px–120px`, `height: 6px`).
   - Subtle asymmetric arc (`M 1 4 Q 32 1, 68 3 T 118 2`) in `--accent-amber` at `55%` opacity.
2. **Registration Corner Brackets (`CornerBrackets`)**:
   - `8px × 8px` hairline `L`-ticks (`stroke: var(--accent-amber)` at `45%` opacity) anchored in top-left and bottom-right corners of the **Live Timer Widget** and **Stats Hero Card**.
3. **Editorial Divider (`SectionRule`)**:
   - Thin `1px` `--border-subtle` rule interrupted at center or left by a `4px` rotated diamond (`◆`) in `--accent-amber`.

### 6.2 Empty-State & Feature Illustrations (`64×64` or `80×80` ViewBox)

Stroke palette: primary contour in `--text-secondary` (`1.3px`), single focal highlight in `--accent-amber` (`1.4px`), soft background wash (`8%` opacity `--accent-beige` or `--accent-amber`).

- **Weekend ("Вихідний день")**: Minimalist crescent arc + resting fountain pen over a closed notebook contour (replaces `🏖️`).
- **No Lessons Weekday ("Пар немає")**: Open architectural bookmark ribbon + faint horizon line (replaces `🌴`).
- **No Attendance Records ("Відміток ще немає")**: Clean 5×3 dot-matrix grid with one amber circled cell.
- **No Notes / Deadlines ("Нотаток та дедлайнів немає")**: Geometric ruled card with a single tilted pencil nib and small amber spark dot.

---

## 7. Core & New Feature Component Specifications

### 7.1 Live Timer / Current Lesson Widget

Appears at the top of the Schedule view whenever a pair is **active now** (`currentLesson`) or **upcoming within ≤ 30 min break** (`nextLesson` countdown):
- **Surface:** Glass Amber-Lit (`--surface-glass-amber`), `rounded-2xl`, `CornerBrackets` ornament.
- **Top row:** Pulsing `6px` Warm Amber beacon dot + `ЗАРАЗ ТРИВАЄ` (or `ПЕРЕРВА · ДАЛІ 2 ПАРА`) in `micro-kicker` mono + remaining time badge (`24:18` in `JetBrains Mono`, `tabular-nums`, `--accent-amber-fg`).
- **Middle:** Subject title (`16px`, `font-semibold`), classroom code (`№14/Б · вул. Драгоманова`), and lesson type pill.
- **Progress bar:** `4px` rounded track (`--bg-surface-elevated`) with smooth Warm Amber gradient fill (`#D88B45` → `#E5A465`) reflecting elapsed `%` of the 80-minute pair.
- **Quick Actions:** Inline compact attendance toggle (`Був / Н-ка / Поважна`) + `+ Нотатка` button.

### 7.2 `PairCard` (Redesigned)

- **Surface:** Matte `--bg-surface` (`rounded-2xl`, `1px solid var(--border-subtle)`, `p-4`). When `isCurrent` is true (or selected/expanded), upgrades to `border-color: rgba(216, 139, 69, 0.45)` + subtle glass elevation.
- **Header row:** Monospace order circle (`01`–`08`, `26×26px`), monospace time (`08:30 – 09:50`), right-aligned subgroup pill (`Підгр. 1`), elective indicator if applicable, and semantic `LessonType` badge.
- **Body:** Subject title (`15.5px–16px`, `font-semibold`), classroom (`MapPin` + mono `classroom.code` + building), teacher (`User` + `teacher.fullName`), plus optional **Note/Deadline preview strip** (1-line truncated note or `Дедлайн: Чт` pill in Terracotta/Amber).
- **Footer:** `1px solid var(--border-subtle)` top divider; `Відмітка:` label + 3 tactile `min-h-[36px]` (`44px` hit target on mobile via padding) attendance buttons (`Був`, `Н-ка`, `Поважна`) + overflow/note icon trigger (`StickyNote` / `MoreHorizontal`) opening a Glass Context Menu or Note Sheet.

### 7.3 Notes & Deadlines (2.0 Feature)

- **Inline Card Indicator:** If a lesson/subject has notes or pending deadlines, `PairCard` displays a subtle footer pill (`1 нотатка` in Muted Beige, or `Дедлайн: Завтра` in Terracotta if ≤ 48h, Warm Amber if > 48h).
- **Note & Deadline Drawer / Modal (Glass Strong)**:
  - **Mobile:** Bottom sheet (`rounded-t-3xl`, `pb-safe`, drag handle `36×4px` in `--border-strong`).
  - **Desktop:** Centered modal (`max-w-[480px]`, `rounded-2xl`) or right-hand inspector drawer.
  - **Fields:** Subject auto-linked, Note textarea (styled in `--bg-canvas` inset box with `--border-subtle` and Warm Amber focus ring), Deadline toggle + date/time input + priority chip (`Звичайний` / `Терміново`).
  - **Deadline Checklist Item:** Custom `18×18px` rounded-md checkbox (`Sage` fill on complete with strikethrough `--text-muted`).

### 7.4 Week Grid View (2.0 Feature)

- **View Switcher:** Segmented glass pill in Schedule header (`День` | `Тиждень`).
- **Grid Anatomy:**
  - **Time Gutter (`56px` mono):** Pair slots `1`–`8` (`08:30`, `10:10`, `11:50`, `13:30`, `15:05`, `16:40`, `18:10`, `19:40`).
  - **Day Columns (5 columns `Пн`–`Пт`):** Active today column highlighted with subtle top Warm Amber accent rule (`2px`) and `--bg-surface-elevated/40` column wash.
  - **Grid Cells:** Compact matte cards (`rounded-xl`, `p-2.5`) showing left `3px` semantic stripe (`Muted Beige` / `Terracotta` / `Sage`), truncated 2-line subject name, mono room code, and subtle attendance/note dot in top-right corner.
  - **Subgroup / Elective Split:** If showing "All subgroups" or `"both"` electives, cell splits horizontally into two side-by-side mini cards separated by `4px` gap.
  - **Interaction:** Clicking any cell opens a **Glass Popover / Detail Sheet** with full teacher name, attendance toggle, and notes without losing grid context.

### 7.5 Stats Charts (2.0 Feature)

- **Hero Ring / Radial Gauge (`StatsView`)**:
  - Replaced plain `%` text with a clean `132×132px` SVG radial ring (`stroke-width: 8`, rounded caps): background track `--bg-surface-elevated`, segmented progress arcs in `Sage` (`present`), `Warm Amber` (`excused`), and `Terracotta` (`absent`), with `display-stat` (`44px` mono) centered inside and `CornerBrackets` around the card.
- **Weekly Trend Bar Chart**:
  - Compact 6–8 week bar sparkline (`height: 88px`) showing weekly attendance rate with dashed `80%` threshold line in `--border-strong` and Warm Amber hover tooltip.
- **Subject Breakdown Cards**:
  - Preserves existing subject progress bars, upgraded to `--bg-surface` matte cards with `6px` segmented bars (`Sage` / `Warm Amber` / `Terracotta`), tabular mono `%` readout, and subtle `EditorialDivider`.

### 7.6 Navigation, Dialogs & Context Menus

- **Mobile `BottomNav`:** Floating glass dock (`mx-3 mb-2 rounded-2xl` or full-width edge-to-edge docked with `pb-safe`, `Glass Strong`). Active tab displays Warm Amber icon + label + a subtle `20×2.5px` Warm Amber top/bottom indicator pill.
- **Desktop Sidebar (`248px`):** Fixed left `Glass Base` panel containing brand header (`Розклад · ФЕП-33с`), theme toggle (`Темна` / `Світла`), 4 primary nav items (`Розклад`, `Відвідуваність`, `Викладачі`, `Опції`), and a compact upcoming-deadlines summary widget at the bottom.
- **Context Menus & Popovers:** `Glass Strong`, `rounded-xl`, `p-1.5`, `1px solid var(--border-glass)`, items `min-h-[36px]`, hover `--bg-surface-elevated`, destructive action in Terracotta.

---

## 8. Responsive Layout Specifications

### 8.1 Breakpoints

| Tier | Range | Primary Layout Pattern |
| :--- | :--- | :--- |
| **Mobile** | `320px – 430px` | Single-column stack, bottom glass dock, bottom-sheet modals, day-view default |
| **Tablet (Bridge)** | `431px – 1023px` | Centered `max-w-[680px]` container, 2-column stats & teacher grids, horizontal week strip |
| **Desktop** | `1024px – 1920px` | 2-to-3 zone workspace: Left Glass Sidebar (`248px`) + Main Content (`flex-1`, `max-w-[1280px]`) + Optional Right Context Drawer (`320px` at `≥ 1280px` for Live Timer & Deadlines) |

### 8.2 Mobile (`320px – 430px`) Rules

- **Padding:** `16px` horizontal (`12px` below `360px` so `320px` screens never wrap pair headers awkwardly). Bottom clearance `pb-[calc(5.5rem+env(safe-area-inset-bottom))]`.
- **Touch Targets:** Minimum `44×44px` interactive hit area for day-strip pills, attendance buttons, and nav tabs.
- **Week Grid on Mobile:** Accessible via `День | Тиждень` toggle; renders as a `min-w-[640px]` horizontal scroll matrix with a sticky `48px` left time gutter (`position: sticky; left: 0`), or compact vertical day-grouped agenda.
- **Safe Areas:** Top header respects `.pt-safe` (`env(safe-area-inset-top)`); bottom dock and bottom sheets respect `.pb-safe`.

### 8.3 Desktop (`1024px – 1920px`) Rules

- **Grid & Max Widths:** Never stretch a single mobile column across `1920px`.
  - **Schedule (Day View):** `max-w-[760px]` main feed + `320px` sticky right inspector (Live Timer + Deadlines + Quick Filter) at `≥ 1280px`.
  - **Schedule (Week Grid):** Full main pane up to `1360px` (`5` equal `minmax(0, 1fr)` day columns + `64px` time gutter).
  - **Stats:** `2-column` top row (Hero Donut Card + Weekly Trend Chart) above `2-column` (`lg`) / `3-column` (`2xl`) Subject Breakdown grid.
  - **Teachers:** `2-column` (`lg`) / `3-column` (`xl`) grid of teacher cards with search/filter bar.
  - **Settings:** `2-column` masonry or `max-w-[840px]` 2-col layout (Department + Electives left; Subgroup + Theme + Preferences right).
- **Pointer & Keyboard Polish:** Subtle `hover:border-[var(--border-strong)]` transitions (`150ms`), `:focus-visible` `2px` outline in `--accent-amber` with `2px` offset, and `user-select: text` enabled inside note inputs and teacher details (avoid global `user-select: none` on desktop).

---

## 9. Motion & Interaction Tokens

Built on `framer-motion` (already installed `^11.18.2`):
- **Spring (`tactile`):** `{ type: "spring", stiffness: 420, damping: 32, mass: 0.8 }` — active day pill, view switcher thumb, bottom sheet snap.
- **Ease (`editorial`):** `[0.22, 1, 0.36, 1]` (`180ms–220ms`) — card entrance, tab cross-fade, popover reveal.
- **Press feedback:** `active:scale-[0.97]` (`100ms`) on buttons and cards.
- **Reduced Motion:** Respect `@media (prefers-reduced-motion: reduce)` — disable slide/scale transitions and amber live pulse animation, keeping `120ms` opacity fades only.

---

## 10. Phase Two Implementation Tokens

### 10.1 Exact CSS Custom Properties (`src/index.css`)

Uses space-separated RGB channels (`--rgb-*`) for core surfaces/accents so Tailwind opacity modifiers (`bg-surface/80`, `border-accent-amber/40`) work natively, alongside direct semantic variables for glass, shadows, and domain states.

```css
/* ==========================================================================
   GRAPHITE GLASS DESIGN SYSTEM — TOKENS (Phase Two: src/index.css)
   ========================================================================== */

:root,
[data-theme="dark"] {
  color-scheme: dark;

  /* --- Core RGB Channels (for Tailwind <alpha-value> support) --- */
  --rgb-canvas: 36 37 34;            /* #242522 */
  --rgb-surface: 48 49 45;           /* #30312D */
  --rgb-surface-elevated: 57 58 53;  /* #393A35 */
  --rgb-border: 74 75 69;            /* #4A4B45 */
  --rgb-text-primary: 240 238 232;   /* #F0EEE8 */
  --rgb-text-secondary: 168 166 158; /* #A8A69E */

  --rgb-amber: 216 139 69;           /* #D88B45 */
  --rgb-terracotta: 215 123 89;      /* #D77B59 */
  --rgb-sage: 170 181 160;           /* #AAB5A0 */
  --rgb-beige: 216 203 184;          /* #D8CBB8 */

  /* --- Semantic Surface & Text Tokens --- */
  --bg-canvas: #242522;
  --bg-surface: #30312D;
  --bg-surface-elevated: #393A35;
  --bg-surface-secondary: #2B2C28;
  --border-subtle: #4A4B45;
  --border-strong: #5E6058;

  --text-primary: #F0EEE8;
  --text-secondary: #A8A69E;
  --text-muted: #7C7A73;
  --text-on-accent: #242522;

  /* --- Contrast-Safe Accent Foregrounds --- */
  --accent-amber: #D88B45;
  --accent-amber-fg: #E39C5B;
  --accent-amber-soft: rgba(216, 139, 69, 0.14);
  --accent-terracotta: #D77B59;
  --accent-terracotta-fg: #E38D6E;
  --accent-terracotta-soft: rgba(215, 123, 89, 0.14);
  --accent-sage: #AAB5A0;
  --accent-sage-fg: #B8C3AE;
  --accent-sage-soft: rgba(170, 181, 160, 0.14);
  --accent-beige: #D8CBB8;
  --accent-beige-fg: #D8CBB8;
  --accent-beige-soft: rgba(216, 203, 184, 0.12);

  /* --- Selective Glassmorphism --- */
  --bg-glass: rgba(48, 49, 45, 0.72);
  --bg-glass-strong: rgba(57, 58, 53, 0.84);
  --border-glass: rgba(240, 238, 232, 0.11);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.06);
  --shadow-glass: 0 12px 32px -10px rgba(0, 0, 0, 0.45);
  --shadow-elevated: 0 6px 20px -6px rgba(0, 0, 0, 0.35);
  --glow-amber: 0 10px 30px -10px rgba(216, 139, 69, 0.22);
  --backdrop-scrim: rgba(20, 21, 19, 0.64);

  /* --- Lesson Types --- */
  --badge-lecture-bg: rgba(216, 203, 184, 0.12);
  --badge-lecture-border: rgba(216, 203, 184, 0.24);
  --badge-lecture-fg: #D8CBB8;

  --badge-practice-bg: rgba(215, 123, 89, 0.14);
  --badge-practice-border: rgba(215, 123, 89, 0.28);
  --badge-practice-fg: #E38D6E;

  --badge-lab-bg: rgba(170, 181, 160, 0.14);
  --badge-lab-border: rgba(170, 181, 160, 0.28);
  --badge-lab-fg: #B8C3AE;

  /* --- Attendance States --- */
  --status-present-bg: #AAB5A0;
  --status-present-fg: #242522;
  --status-absent-bg: #D77B59;
  --status-absent-fg: #242522;
  --status-excused-bg: #D88B45;
  --status-excused-fg: #242522;
}

[data-theme="light"] {
  color-scheme: light;

  /* --- Core RGB Channels --- */
  --rgb-canvas: 242 240 235;         /* #F2F0EB */
  --rgb-surface: 250 249 246;        /* #FAF9F6 */
  --rgb-surface-elevated: 233 231 225; /* #E9E7E1 */
  --rgb-border: 213 210 202;         /* #D5D2CA */
  --rgb-text-primary: 41 42 40;      /* #292A28 */
  --rgb-text-secondary: 119 118 111; /* #77766F */

  --rgb-amber: 216 139 69;           /* #D88B45 */
  --rgb-terracotta: 215 123 89;      /* #D77B59 */
  --rgb-sage: 170 181 160;           /* #AAB5A0 */
  --rgb-beige: 216 203 184;          /* #D8CBB8 */

  /* --- Semantic Surface & Text Tokens --- */
  --bg-canvas: #F2F0EB;
  --bg-surface: #FAF9F6;
  --bg-surface-elevated: #E9E7E1;
  --bg-surface-secondary: #E9E7E1;
  --border-subtle: #D5D2CA;
  --border-strong: #BCB8AE;

  --text-primary: #292A28;
  --text-secondary: #77766F;
  --text-muted: #98968E;
  --text-on-accent: #FAF9F6;

  /* --- Contrast-Safe Accent Foregrounds (WCAG AA >= 4.5:1 on #FAF9F6) --- */
  --accent-amber: #D88B45;
  --accent-amber-fg: #A85F1D;
  --accent-amber-soft: rgba(216, 139, 69, 0.14);
  --accent-terracotta: #D77B59;
  --accent-terracotta-fg: #AC4F2E;
  --accent-terracotta-soft: rgba(215, 123, 89, 0.14);
  --accent-sage: #AAB5A0;
  --accent-sage-fg: #4E5E43;
  --accent-sage-soft: rgba(170, 181, 160, 0.22);
  --accent-beige: #D8CBB8;
  --accent-beige-fg: #63584A;
  --accent-beige-soft: rgba(216, 203, 184, 0.34);

  /* --- Selective Glassmorphism --- */
  --bg-glass: rgba(250, 249, 246, 0.78);
  --bg-glass-strong: rgba(250, 249, 246, 0.90);
  --border-glass: rgba(41, 42, 40, 0.10);
  --glass-highlight: inset 0 1px 0 rgba(255, 255, 255, 0.70);
  --shadow-glass: 0 12px 32px -12px rgba(41, 42, 40, 0.14);
  --shadow-elevated: 0 4px 16px -4px rgba(41, 42, 40, 0.08);
  --glow-amber: 0 10px 28px -10px rgba(216, 139, 69, 0.24);
  --backdrop-scrim: rgba(41, 42, 40, 0.32);

  /* --- Lesson Types --- */
  --badge-lecture-bg: rgba(216, 203, 184, 0.36);
  --badge-lecture-border: rgba(168, 152, 130, 0.40);
  --badge-lecture-fg: #5F5446;

  --badge-practice-bg: rgba(215, 123, 89, 0.16);
  --badge-practice-border: rgba(215, 123, 89, 0.34);
  --badge-practice-fg: #AC4F2E;

  --badge-lab-bg: rgba(170, 181, 160, 0.25);
  --badge-lab-border: rgba(122, 138, 108, 0.35);
  --badge-lab-fg: #4E5E43;

  /* --- Attendance States --- */
  --status-present-bg: #5B6D50;
  --status-present-fg: #FAF9F6;
  --status-absent-bg: #B85634;
  --status-absent-fg: #FAF9F6;
  --status-excused-bg: #C47630;
  --status-excused-fg: #FAF9F6;
}
```

#### Glass Utility Classes (`src/index.css`)

```css
@layer components {
  .glass-panel {
    background-color: var(--bg-glass);
    border: 1px solid var(--border-glass);
    box-shadow: var(--glass-highlight), var(--shadow-glass);
    backdrop-filter: blur(16px) saturate(135%);
    -webkit-backdrop-filter: blur(16px) saturate(135%);
  }

  .glass-strong {
    background-color: var(--bg-glass-strong);
    border: 1px solid var(--border-glass);
    box-shadow: var(--glass-highlight), var(--shadow-glass);
    backdrop-filter: blur(24px) saturate(150%);
    -webkit-backdrop-filter: blur(24px) saturate(150%);
  }

  .glass-amber-lit {
    background-color: var(--bg-glass);
    background-image: radial-gradient(
      120% 90% at 10% 0%,
      rgba(var(--rgb-amber) / 0.14) 0%,
      transparent 60%
    );
    border: 1px solid rgba(var(--rgb-amber) / 0.42);
    box-shadow: inset 0 1px 0 rgba(var(--rgb-amber) / 0.18), var(--glow-amber);
    backdrop-filter: blur(18px) saturate(140%);
    -webkit-backdrop-filter: blur(18px) saturate(140%);
  }

  @supports not (backdrop-filter: blur(1px)) {
    .glass-panel,
    .glass-strong,
    .glass-amber-lit {
      background-color: var(--bg-surface-elevated);
    }
  }
}
```

### 10.2 Tailwind Theme Extensions (`tailwind.config.js`)

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--rgb-canvas) / <alpha-value>)',
        surface: {
          DEFAULT: 'rgb(var(--rgb-surface) / <alpha-value>)',
          elevated: 'rgb(var(--rgb-surface-elevated) / <alpha-value>)',
          secondary: 'var(--bg-surface-secondary)',
        },
        line: {
          DEFAULT: 'rgb(var(--rgb-border) / <alpha-value>)',
          strong: 'var(--border-strong)',
          glass: 'var(--border-glass)',
        },
        ink: {
          DEFAULT: 'rgb(var(--rgb-text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--rgb-text-secondary) / <alpha-value>)',
          muted: 'var(--text-muted)',
        },
        amber: {
          DEFAULT: 'rgb(var(--rgb-amber) / <alpha-value>)',
          fg: 'var(--accent-amber-fg)',
          soft: 'var(--accent-amber-soft)',
        },
        terracotta: {
          DEFAULT: 'rgb(var(--rgb-terracotta) / <alpha-value>)',
          fg: 'var(--accent-terracotta-fg)',
          soft: 'var(--accent-terracotta-soft)',
        },
        sage: {
          DEFAULT: 'rgb(var(--rgb-sage) / <alpha-value>)',
          fg: 'var(--accent-sage-fg)',
          soft: 'var(--accent-sage-soft)',
        },
        beige: {
          DEFAULT: 'rgb(var(--rgb-beige) / <alpha-value>)',
          fg: 'var(--accent-beige-fg)',
          soft: 'var(--accent-beige-soft)',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        serif: ['Literata', 'Georgia', '"Times New Roman"', 'serif'],
        mono: ['"JetBrains Mono"', '"SF Mono"', 'ui-monospace', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.375rem',
      },
      boxShadow: {
        glass: 'var(--shadow-glass)',
        elevated: 'var(--shadow-elevated)',
        'amber-glow': 'var(--glow-amber)',
      },
      screens: {
        xs: '360px',
        desktop: '1024px',
        wide: '1440px',
      },
    },
  },
  plugins: [],
};
```

---

## 11. Migration Checklist for Phase Two

1. **Theme & Font Initialization (`index.html`, `src/index.css`)**:
   - Remove hardcoded `class="bg-black"` on `<body>`; apply `bg-canvas text-ink font-sans antialiased`.
   - Load `Inter`, `JetBrains Mono`, and `Literata` with `cyrillic` subset; initialize `data-theme` (`dark` default, user-toggleable to `light` or `system`) in `useSettings` + inline pre-paint script to avoid FOUC.
   - Update PWA `<meta name="theme-color">` dynamically or provide dark/light media attributes (`#242522` / `#F2F0EB`).
2. **Replace iOS `#0A84FF` & `#1C1C1E` Hardcodes**:
   - Migrate all `#0A84FF` accents in `App.tsx`, `BottomNav.tsx`, `PairCard.tsx`, `StatsView.tsx`, and `SettingsView.tsx` to `amber` / `amber-fg`.
   - Migrate `#1C1C1E` / `bg-black` cards to `bg-surface` (matte) and `glass-panel` / `glass-strong` / `glass-amber-lit` (selective glass surfaces).
3. **Typography & Tabular Numbers**:
   - Apply `font-mono tabular-nums` to pair order badges, start/end times, live countdowns, room codes, and stat percentages.
4. **Desktop Shell & New 2.0 Views**:
   - Extract `DesktopSidebar`, `LiveTimerWidget`, `WeekGridView`, `NotesDeadlineDrawer`, `StatsCharts`, and `EditorialOrnaments` SVG components.
