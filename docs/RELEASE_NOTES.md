# Release Notes — Uni Schedule

## v4.3.1 (2026-11-26) — Signature Animation Correction

- **Покращена анімація запуску (Hybrid №25):** Точніше відтворення Signature Calendar Reveal (`3000 мс`, `prefers-reduced-motion` `280 мс`) на єдиному `elapsed`-time `rAF` timeline без покадрових React `setState`.
- **Геометричний FLIP-handoff та хвиля розкриття:** Плавніший морфінг сонця в реальну дату дня, безперервний перехід календаря у справжній `WeekStrip` (`2020–2480 мс`) без дублювання, скоригована bottom-up хвиля (`1960–2600 мс`) та синхронізована поява `BottomNav` (`2680 мс`).
- **Початковий рендеринг і PWA:** Покращене початкове відображення фону у світлій і темній темах; Service Worker оновлено до `v16` (без змін D1-схеми). Деталі: [docs/releases/v4.3.1.md](releases/v4.3.1.md).

## v4.3.0 (2026-11-26) — Experience & Communication Update

- **Анімація запуску Hybrid №25 — Signature Calendar Reveal (Stage A):** Реалізовано затверджену 3-секундну анімацію запуску (Quiet Sunrise → морфінг у реальну поточну дату → розгортання плиток тижня → вигнуте хвильове розкриття в живий інтерфейс → поява `BottomNav`), підтримку світлої/темної теми та `prefers-reduced-motion` (~320 мс).
- **Зв'язок із розробником (Stage B):** Додано розділ «Зв'язок із розробником» із прямим безпечним переходом у Telegram (`@kost99_99`) у нижній частині Налаштувань.
- **«Що нового?» та «Історія оновлень» (Stage C):** Додано користувацьке вікно змін після оновлення, історію підтверджених версій із SemVer-сортуванням, офлайн-підтримкою та індикатором непрочитаного релізу.
- **Сповіщення про оновлення (Stage D):** Додано окремий opt-in перемикач «Новини та оновлення» (вимкнений за замовчуванням), адитивну D1-міграцію `0010_release_communication.sql`, ідемпотентну дедуплікацію доставок `PRIMARY KEY (release_id, user_id)` та підтримку deep links `/?view=release&version=...` у Service Worker `v15`.
- **Release Management (Stage E):** Канонічний каталог `src/data/releases.ts`, публічні read-only endpoints `/api/releases*`, захищені admin endpoints і CLI `scripts/publish-release.ts` із безпечним `--dry-run`. Деталі: [docs/releases/v4.3.0.md](releases/v4.3.0.md).

## v4.2.1 (2026-11-26) — Academic Schedule Integrity Update

- **Універсальна персоналізація паралельних підгруп (`parallelGroups.ts`):** Виявлено та усунуто першопричину відображення 20+ паралельних занять в один день для груп із комбінованими збірними мовними секціями (`ІНА-35с`, `ІНА-34с`, `ІНА-36с`, а також `ФЕП-13с` з `Іноземна мова`). Модель динамічно визначає підтверджені паралельні виміри (наприклад, «Перша іноземна мова», «Друга іноземна мова» з мовними варіантами `Іспанська` / `Німецька` / `Французька` та викладацькими підгрупами, «Іноземна мова») без хардкоду під окрему групу.
- **Динамічний UI профілю та чесний fallback:** Блок «Мовні та паралельні підгрупи» на базі `PremiumSelect` показується лише для груп із підтвердженими паралельними секціями (не зачіпає `ФЕП-33с` із кафедрами та числовими підгрупами). Якщо підгрупи ще не обрано, обов'язкові пари не приховуються мовчки — відображається інформаційний банер із швидким переходом до налаштувань.
- **Узгодженість Day View, Week View, LivePairHero, офлайн-кешу, бекапу та Push:** Єдині правила фільтрації застосовано на фронтенді й у Cloudflare Worker (`workers/api/src/push/scheduler.ts`), додано адитивну D1-міграцію `0009_profile_parallel_groups.sql` (сумісну з клієнтами v4.2.0) та збережено 100% сумісність `lesson.id` з історією відвідуваності.
- **Аудит «Аудиторію не вказано»:** Підтверджено за сирим HTML офіційного розкладу ЛНУ, що 166 із 172 блоків `ІНА-35с` дійсно не містять `<span class="room_name">` у першоджерелі; застосунок чесно відображає відсутність аудиторії без вигадування даних.
- Service Worker оновлено до `v14`. Деталі: [docs/releases/v4.2.1.md](releases/v4.2.1.md).

## v4.2.0 (2026-11-26) — Premium Experience Update

- **Stage A (iOS Viewport & Zoom):** Усунуто автоматичний iOS-зум на полях вводу (`font-size: 16px !important` для мобільних полів), прибрано пастку `gesturestart` в `index.html`, додано `useKeyboardViewport` із приховуванням `BottomNav` під час відкритої клавіатури.
- **Stage B (Signature Brand Reveal):** Новий 2.5s запуск `AppSplash` із оптично скоригованим 136px логотипом, діагональним розкриттям, типографічним словознаком `Uni Schedule` та aperture-морфінгом у реальний інтерфейс.
- **Stage C (Scroll-Driven BottomNav):** Плавна scroll-driven навігація на `MotionValue` (`356×58px` → `292×50px`, 0 ре-рендерів при скролі, миттєвий розворот вгору, 5-колонковий індикатор без `ResizeObserver`).
- **Stage D–E (Academic Selectors & Profile Hydration):** Портальний `PremiumSelect` (Bottom Sheet на мобільних / Popover на десктопі, `z-[90]` — усуває перекриття карткою «Підгрупа»), перегляд груп без авто-клавіатури, `isHydratingRemoteProfile`.
- Service Worker оновлено до `v13`; нових міграцій D1 не потрібно. Деталі: [docs/releases/v4.2.0.md](releases/v4.2.0.md).

## v4.1.1 (2026-11-25) — Academic Reliability & Premium Launch Experience

- **Stage A:** Усунуто циклічну інвалідацію запитів у `useScheduleSource`, розділено активний і очікуваний профілі, стабілізовано чернетку `UniversitySelectorCard`, додано підтримку підтверджених порожніх розкладів.
- **Stage B:** Впроваджено перевірений академічний каталог ЛНУ (`lnuAcademicCatalog.ts`), сувору серверну й клієнтську фільтрацію по факультету/спеціальності, окремий режим глобального пошуку, захист метаданих D1 та міграцію `0008_academic_catalog_metadata.sql`.
- **Stage C:** Повний редизайн 2.5s запуску (`AppSplash` Brand-to-Interface Morph, 124px логотип, 30px словознак, виправлений життєвий цикл без передчасного завершення, синхронізація з `AppShell` та `BottomNav`).
- **Stage D:** Нова геометрична модель `BottomNav` на єдиному `compactProgress` без `ResizeObserver`, точна 5-колонкова прив'язка індикатора та вдосконалений `useScrollCompact`.
- Service Worker оновлено до `v12`. Деталі: [docs/releases/v4.1.1.md](releases/v4.1.1.md).

## v4.1.0 (2026-11-25) — Premium Motion & Native Interaction

- **Stage A:** Усунуто вертикальні стрибки індикаторів (`SegmentedControl` та `BottomNav` переведено на локальні transform-індикатори) та стрибки скролу при перемиканні вкладок.
- **Stage B:** Хореографований ~2.5s `AppSplash` із єдиним `launchPhase` (`intro → reveal → done`).
- **Stage C–D:** Узгоджені іконки Phosphor `duotone/regular` та динамічна scroll-responsive капсула `BottomNav` (без glassmorphism).
- **Stage E:** Очищено застарілі тексти `v2.0 / Graphite Glass / Вбудований ФЕП-33с` у Налаштуваннях, безпечний `resetSettings`, задокументовано перевірку «Людина і космос» в ЛНУ.
- Service Worker оновлено до `v11`. Деталі: [docs/releases/v4.1.0.md](releases/v4.1.0.md).

## v4.0.0 (2026-11-25) — Native Mobile Experience & Academic Profiles

- **Stage A–C:** Плаваюча капсула `BottomNav` зі спільним індикатором `layoutId="mobileNavIndicator"` (без glassmorphism), анімований запуск `AppSplash`, приховані мобільні скролбари та захист від випадкового зуму.
- **Stage D–E:** Видалено публічний «Вбудований ФЕП-33с» із безпечною авто-міграцією legacy-користувачів; додано data-driven реєстр кафедр (`СП`/`ОІТ`/`РКС`/`РКТ`) для живих груп `ФЕП-31с`–`ФЕП-34с` (включно з Push).
- **Stage F–G:** Доступний пошуковий `combobox` груп із чесним розділенням підтверджених/непідтверджених груп факультету та онбординг при першому запуску (`FirstLaunchOnboarding`).
- Service Worker оновлено до `v10`; нових міграцій D1 не потрібно.
- Деталі: [docs/releases/v4.0.0.md](releases/v4.0.0.md).

## v3.6.0 (2026-11-25) — Complete Stabilization

- **Stage A:** Усунуто FK `502` для нових груп (`INSERT OR IGNORE`), атомарна staged-публікація розкладу, `source_mode` + `revision` (міграція `0007`), мультигруповий кеш `v3`, `force=1` для ручного оновлення.
- **Stage B:** Нормалізація гомогліфів (`ЕКІ-11с` ↔ `ЕКІ-11c`), `wish_gr_2` практика (`ПМІ-31с`), мовні `Збірна група` (`ІНА-34с`), валідація групи в HTML, порожня форма ЛНУ без `502`, корпус в ID аудиторії та опційний `floor`.
- **Stage C:** Збереження всіх історичних записів відвідуваності (158+ кейс), черга синку для `replaceRecords`/`mergeRecords`, збереження `updatedAt` і профілю в бекапі, детермінований merge, серіалізація синку.
- **Stage D:** `resolveTokenPepper` у `handleRotateToken`, `covered_from`/`covered_to` guard, `scheduleScope` у `dedupKey`, коректні дати у п'ятничному зведенні, mid-tick перевірка `revision`.
- **Stage E:** SW `v9` + bypass `/api/`, українські кафедри в UI, атомарний D1 rate-limit, D1 check у `/api/health`.
- Деталі: [docs/releases/v3.6.0.md](releases/v3.6.0.md).

Детальний опис див. у [`docs/releases/v3.5.1.md`](./releases/v3.5.1.md): автопідстановка префікса групи (`ІНА-34` → `ІНА-34с`), банер вибору ДВВС при порожньому `selectedElectives`, та збереження вбудованого розкладу на першому запуску.

---

# Release Notes — Uni Schedule `v3.5.0`

Детальний опис релізу див. у [`docs/releases/v3.5.0.md`](./releases/v3.5.0.md).

- **Фокус релізу:** надійність LNU-парсера, виправлення метаданих викладачів/аудиторій (`t_*`/`c_*`/`—`), коректність дат і кешу (`uni_schedule_cached_group_v2`), розділення кафедр/потоків/ДВВС, вирівнювання Push-фільтрації та міграція `0006_schedule_coverage.sql`.
- **База даних:** перед деплоєм Worker необхідно застосувати `workers/api/migrations/0006_schedule_coverage.sql`.

---

# Release Notes — Uni Schedule `v3.0.0`

**Версія:** `v3.0.0`  
**Гілка підготовки:** `feat/final-hardening` (`9793ad55dcbfbaf8cfc530846aa9efe04963d0ba`)  
**Статус:** Локально верифіковано; віддалений staging заблокований на етапі `workers.dev` onboarding та Vercel Preview auth (див. `docs/PROJECT_READINESS_REPORT.md`).

---

## Основні зміни у `v3.0.0`

### 1. Інтеграція університетів (ЛНУ + ручний fallback)
- Додано інтеграцію з розкладом ЛНУ ім. Івана Франка (`dekanat.lnu.edu.ua`): завантаження списку груп, парсинг розкладу та кешування у Cloudflare D1 з fallback-механізмом.
- Реалізовано реєстр університетів та режим ручного введення (`manual_only`) для груп і розкладів без зовнішнього API.

### 2. Бекенд на Cloudflare Workers + D1
- Реалізовано REST API на Cloudflare Workers (`workers/api`) з базою даних Cloudflare D1 (міграції `0001`–`0004` з `FOREIGN KEY`, `UNIQUE`, `CHECK`, `NOT NULL`).
- Додано ізольовану staging-конфігурацію `[env.staging]` (`uni-schedule-staging` + `uni-schedule-staging-db`).

### 3. Web Push та 5 Cron-сценаріїв сповіщень
- Реалізовано Web Push (VAPID + `AES-128-GCM` шифрування payload) з управлінням підписками через `/api/push/*`.
- Налаштовано Cron Trigger (`*/5 * * * *`) із підтримкою 5 сценаріїв сповіщень, обліком переходу на літній/зимовий час (DST) та атомарною дедуплікацією через `notification_logs`.

### 4. Крос-пристроєвий Offline-first Attendance Sync
- Додано синхронізацію відвідуваності та профілю між пристроями за допомогою 256-бітного `syncToken` (`ust_...`) та прив’язки пристроїв.
- Реалізовано локальну офлайн-чергу змін (`uni_schedule_attendance_queue_v1`), оптимістичне версіонування (`baseVersion`) та коректну обробку конфліктів (`stale` / `unmarked`).

### 5. Graphite Glass PWA
- Збережено та розвинуто дизайн-систему **Graphite Glass** (Graphite Dark / Warm Parchment Light), `LivePairHero` з відліком до кінця/початку пари, нотатки до пар і дедлайни, довідник викладачів/аудиторій, калькулятор цілі відвідуваності, тижневі тренди та JSON v2 експорт/імпорт.
- Оновлено Service Worker (`public/sw.js`) та офлайн-сторінку (`/offline.html`) для надійної роботи без мережі.

### 6. Stage 7 / Stage 8 Hardening та якість
- Впроваджено CORS allowlist (без wildcard `*`), хешування `syncToken` з `TOKEN_PEPPER` (SHA-256), D1 rate limiting (`429` з `Retry-After`) та глобальну обробку помилок без витоку stack trace / SQL.
- Проведено повну локальну регресію: `47/47` TypeScript-тестів, `localApiMatrix` (`1/1`), `localD1ConstraintsAndCron` (`2/2`), Playwright E2E по 9 viewport (`verify_app.py`) та 2-пристроєвий offline sync (`verify_attendance_sync.py`), `npm run build` і `wrangler deploy --dry-run`.
