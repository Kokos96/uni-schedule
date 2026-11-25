# Release Notes — Uni Schedule `v3.5.1`

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
