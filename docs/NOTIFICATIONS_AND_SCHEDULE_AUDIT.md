# Аудит Uni Schedule: інтеграція університетів, профіль студента та Web Push Notifications

Дата аудиту: `2026-11-18`  
Репозиторій: `https://github.com/Kokos96/uni-schedule` (`main` @ `ed8205d`)  
Етап: **Етап №1 — Повний аудит та архітектурне проєктування (без змін робочого коду)**

---

## 1. Поточна архітектура застосунку

`uni-schedule` — це клієнтський React + TypeScript + Vite PWA-застосунок (дизайн-система *Graphite Glass*), розгорнутий як статичний сайт на Vercel (`vercel.json` із SPA rewrite та кеш-заголовками).

### Фактична структура `src/` та `public/`
- **Точка входу та оркестрація:** `src/main.tsx`, `src/App.tsx` (~540 рядків після рефакторингу), `src/components/layout/{AppShell,SidebarNav,BottomNav,OfflineBanner,RootErrorBoundary,ViewSkeleton}.tsx`.
- **Екрани (lazy-loaded через `React.lazy`):**
  - Розклад: `ScheduleView`, `LivePairHero`, `PairCard`, `WeekStrip`, `WeekGrid`, `WeekGridSection`, `LessonNotesDrawer` (`LessonNoteTab`, `LessonDeadlineTab`).
  - Дедлайни: `DeadlinesView`, `DeadlineCard`, `DeadlineFormModal`.
  - Статистика: `StatsView`, `AttendanceRingCard`, `AttendanceCalculator`, `AttendanceTrends`, `SubjectAttendanceList`.
  - Довідник: `DirectoryView`, `TeachersList`, `ClassroomsList`.
  - Налаштування: `SettingsView`, `ProfileSettingsSection`, `AppearanceSettingsSection`, `BackupSection`.
- **Доменні хуки:** `useSettings`, `useAttendance`, `useNotes`, `useDeadlines`, `useCurrentPair`, `useTheme`, `useTodayDate`, `useOnlineStatus`, `useMediaQuery`.
- **Дані та утиліти:** статичні JSON (`src/data/schedule.json`, `teachers.json`, `classrooms.json`), `src/utils/{schedule,date,attendanceMath,backup,storage,url,cn}.ts`, `src/constants/profile.ts`.
- **PWA-шар:** `public/manifest.json` (зараз захардкоджено `"Розклад ФЕП-33с"`), `public/sw.js` (`CACHE_VERSION = 'v6'`, precache shell + stale-while-revalidate для `/assets/` та `/icons/`), `public/offline.html`.
- **Backend:** відсутній повністю. Усі дані зберігаються виключно у `localStorage` браузера.

---

## 2. Як зараз зберігається і працює розклад

1. **Джерело даних:** статичні бандли `src/data/schedule.json` (7 днів тижня `dayNumber: 1..7`, циклічний розклад на `numerator` / `denominator` / `both`), `src/data/teachers.json`, `src/data/classrooms.json`.
2. **Модель `Lesson` (`src/types/index.ts`):**
   - `id`, `order` (1..8), `startTime`, `endTime`, `name`, `type` (`'Лекція' | 'Практична' | 'Лабораторна'`), `teacherId`, `classroomId`, `weekType` (`'numerator' | 'denominator' | 'both'`), `subgroup?`, `isElective?`, `electiveKey?`, `departments?` (`'sp' | 'oit' | 'rks' | 'rkt'`).
   - **Обмеження:** модель не має дати конкретної пари (`date`), ID університету (`universityId`), групи (`groupId`), ознак змін/замін/скасування (`status`: `active | cancelled | rescheduled | room_changed`).
3. **Фільтрація та сітка (`src/utils/schedule.ts`):**
   - `getDayLessons`, `filterLessons(lessons, profile, weekParity)`, `buildWeekGrid(...)`, `PAIR_TIME_SLOTS` (8 пар: `08:30`–`21:00`).
   - `lessonsMap`, `teachersMap`, `classroomsMap` створюються один раз на рівні модуля зі статичних JSON. Це критичне місце: зараз усі модулі імпортують ці глобальні `Map` напряму.
4. **Таймер поточної пари (`src/hooks/useCurrentPair.ts`):**
   - Порівнює поточний локальний час пристрою (`new Date()`) зі списком пар `todayLessons` (`in_lesson`, `break`, `before_first`, `after_last`, `free_day`). Працює лише в активній вкладці браузера.

---

## 3. Як працює відвідуваність

- **Хук:** `src/hooks/useAttendance.ts`, ключ `localStorage`: `uni_schedule_attendance_v1`.
- **Модель `AttendanceRecord`:** `{ lessonId: string; date: string; status: 'present' | 'absent' | 'excused' }`.
- Невідмічені пари не створюють запису в масиві (`getStatus` повертає `null`).
- **Математика (`src/utils/attendanceMath.ts`):**
  - `computeAttendanceSummary` рахує `attended = present + excused`, `totalMarked = present + absent + excused`, `percentage = null` коли `totalMarked === 0` (невідмічені пари **не** рахуються як пропущені).
  - `filterRecordsBySettings` фільтрує записи через `lessonsMap.get(record.lessonId)` — це означає, що при переході на динамічні розклади інших груп `lessonsMap` має будуватися з активного розкладу (або статистика повинна також враховувати збережені метадані заняття).
- **Експорт/імпорт (`src/utils/backup.ts`):** підтримує JSON schema v2 (`attendance`, `settings`, `notes`, `deadlines`) та legacy v1 (`AttendanceRecord[]`), має `deduplicateAttendanceRecords` за парою `(lessonId, date)`.

---

## 4. Як працюють налаштування

- **Хук:** `src/hooks/useSettings.ts`, ключ `localStorage`: `uni_schedule_settings_v2`.
- **Модель `UserSettings`:** `{ subgroup: 1 | 2, department: 'sp' | 'oit' | 'rks' | 'rkt', electiveCourse: 'freelance' | 'management' | 'space' | 'both', theme, attendanceGoal, showWeekends, semesterStartDate, desktopScheduleMode }`.
- `normalizeSettings()` гарантує безпечний fallback до `DEFAULT_SETTINGS`.
- **Прогалини для мультиуніверситетського сценарію:** відсутні `universityId`, `facultyId`, `programId`, `course`, `groupId`, `groupName`, `timezone` (зараз за замовчуванням неявно локальний час браузера, для серверних сповіщень потрібен явний IANA timezone, наприклад `Europe/Kyiv`), а також `notificationPreferences`.

---

## 5. Аналіз CrutchShed і джерела ЛНУ (`dekanat.lnu.edu.ua`)

### 5.1. Репозиторій `frankov-dev/CrutchShed`
- **Ліцензія:** відсутня (`license: None` у GitHub API). Механічне копіювання коду заборонено/ризиковане — використовуємо лише як технічний референс DOM-селекторів і протоколу, реалізуючи власний парсер з нуля.
- **Як працює референс:**
  - `parser.py` робить GET на `https://dekanat.lnu.edu.ua/cgi-bin/timetable.cgi?n=700&group=-3165`, декодує відповідь як `cp1251`, парсить елементи `h4` (дати виду `DD.MM.YYYY`) та `tr` з трьома `td`: номер пари, час (`start\nend`), клітинка з паралельними елементами `.p_name`, `.p_type_name`, `.t_name`, `.gr2_name`, `.room_name`.
  - `.github/workflows/update.yml` оновлює `schedule.json` раз на добу (`cron: '0 21 * * *'`).
  - **Недолік:** захардкоджений числовий ID групи (`-3165`), немає вибору факультету/курсу/будь-якої групи, немає дедуплікації змін чи підтримки діапазону дат.

### 5.2. Емпірична перевірка `https://dekanat.lnu.edu.ua/cgi-bin/timetable.cgi`
Під час аудиту виконано прямі HTTP-запити до сервера ЛНУ («ПС-Розклад v.4.0» від ПП Політек-Софт, кодування `windows-1251`):
1. **Список факультетів:** на стартовій сторінці `GET /cgi-bin/timetable.cgi` у `<select name="faculty">` міститься 22 факультети/підрозділи з ID (`1001`–`1025`), зокрема `1005` — *Факультет електроніки та комп'ютерних технологій*.
2. **Курси:** `<select name="course">` містить `1..6`.
3. **Динамічний довідник усіх груп ЛНУ:** `GET /cgi-bin/timetable.cgi?n=701&lev=142` повертає JSON `{ "query": "", "suggestions": ["АБЛБ-1с", ..., "ФЕП-33с", ...] }` (у `cp1251`) з повним переліком актуальних назв груп. Важливе спостереження: цей endpoint ігнорує `faculty` і `course` у query-параметрах і повертає повний список груп університету. Тому у нашому адаптері ми можемо:
   - кешувати повний перелік груп у D1 (оновлення 1 раз на тиждень/добу),
   - надавати пошук групи за префіксом/назвою та мапити відомі факультетські префікси (або дозволити фільтрацію пошуком, не вигадуючи фейкові зв'язки `program -> group`, яких джерело ПС-Розклад не надає!).
4. **Отримання розкладу без вгадування ID:** `POST /cgi-bin/timetable.cgi?n=700` із `application/x-www-form-urlencoded` у кодуванні `windows-1251` (`faculty`, `course`, `group=<назва групи в cp1251>`, `sdate=DD.MM.YYYY`, `edate=DD.MM.YYYY`) повертає `200 OK` та готову HTML-таблицю розкладу для **будь-якої** групи ЛНУ на заданий період.

### 5.3. Порівняння варіантів виконання парсера

| Критерій | Варіант A: окремий Python-скрипт (GitHub Actions / зовнішній сервіс) | Варіант B: TypeScript-адаптер у Cloudflare Worker |
|---|---|---|
| **Складність інфраструктури** | Потрібно зв'язувати 2 середовища (GH Actions / сервер + Worker + секретний webhook), затримка синхронізації на вимогу нового студента | Єдина серверна кодова база на TypeScript; миттєве завантаження розкладу, коли студент обирає нову групу |
| **Кодування `cp1251`** | `requests` + `BeautifulSoup` | Нативний `TextDecoder('windows-1251')` + власний легкий cp1251 percent-encoder для POST + `node-html-parser` / легкий HTML-парсер |
| **Стабільність і ліміти** | GitHub Actions має затримки cron до 15–40 хв; залежить від токена | Cloudflare Worker відповідає за мілісекунди, HTML однієї групи (~20 КБ) парситься за 1–3 мс CPU |
| **Масштабування** | Складно парсити нові групи на льоту | Групи оновлюються за запитом + кешуються в D1 + періодичний cron лише для активних груп |

**Висновок:** **Варіант B (TypeScript-адаптер у Cloudflare Worker)** є оптимальним. Нативний `TextDecoder('windows-1251')` повністю підтримується в Cloudflare Workers Runtime, а легкий HTML-парсер (`node-html-parser` або стримінговий `HTMLRewriter` / беззалежний парсер таблиць) укладається в < 5 мс CPU.

---

## 6. Які компоненти можна повторно використати, розширити чи додати

### Залишаємо без переписування (перевикористовуємо)
- Усю дизайн-систему Graphite Glass (`src/index.css`, `tailwind.config.js`, `GlassCard`, `ModalDrawer`, `SegmentedControl`, `Badge`, `Toast`, `MotionPrimitives`).
- Усю UI-логіку відображення дня/тижня (`ScheduleView`, `WeekStrip`, `WeekGrid`, `PairCard`, `LivePairHero`, `LessonNotesDrawer`), дедлайнів (`DeadlinesView`), статистики (`StatsView`, `AttendanceCalculator`, `AttendanceTrends`), довідника (`DirectoryView`).
- Механізм офлайн-кешування статичних ресурсів у `public/sw.js` (розширюється обробниками `push` та `notificationclick`).

### Потрібно розширити
1. **Контекст / постачальник розкладу:** замість глобальних констант `scheduleData`, `lessonsMap`, `teachersMap`, `classroomsMap` ввести реактивний джерело-незалежний `ScheduleContext` або хук `useScheduleSource()`, який за замовчуванням може використовувати локальний fallback (або кеш із `localStorage`/IndexedDB), а після вибору групи підвантажує нормалізований розклад із API і будує `lessonsMap` / `teachersMap` / `classroomsMap` динамічно.
2. **Профіль студента (`useSettings` + `ProfileSettingsSection`):** додати вибір університету, факультету, курсу, групи, підгрупи (опційно для сумісності з ручним фільтром ФЕП-33с або авто-підгрупами з парсера), часовий пояс (`Europe/Kyiv`).
3. **`useAttendance`:** додати чергу офлайн-синхронізації (`pendingMutations`) і фонову синхронізацію з API без втрати миттєвої реакції інтерфейсу.
4. **`public/sw.js`:** додати слухачі `push` (парсинг JSON payload, `showNotification`) та `notificationclick` (відкриття/фокус вкладки застосунку на потрібному маршруті), не ламаючи наявний офлайн-кеш.
5. **`public/manifest.json`:** зробити загальнішу назву/опис (без жорсткого «ФЕП-33с» для нових університетів, зберігши коротку назву «Розклад»).

### Яких компонентів бракує
- `src/integrations/universities/` (контракт `UniversityAdapter`, реєстр університетів, нормалізатори, спільний тип `NormalizedSchedule` + `ScheduleLesson`).
- `workers/api/` (новий окремий пакет/директорія Cloudflare Worker із Hono/itty-router або чистим Fetch router, `wrangler.toml`, D1-міграціями, адаптером ЛНУ, Cron-планувальником і Web Push VAPID відправником без зовнішніх платних сервісів).
- UI-майстер вибору університету/групи (Onboarding / Profile modal у Налаштуваннях).
- Блок **Сповіщення** у Налаштуваннях (статус браузерного дозволу, інструкція для iOS PWA Home Screen, кнопка «Увімкнути сповіщення», тумблери та інтервали для 5 типів сповіщень).
- Клієнтський API-клієнт з анонімним токеном пристрою/користувача (`device_token` / `user_secret` у `Authorization: Bearer ...` — без зайвої реєстрації, але з жорсткою ізоляцією даних на бекенді).

---

## 7. Потенційні конфлікти та ризики міграції даних

1. **Конфлікт ID занять (`lessonId`) між статичним `schedule.json` і динамічним парсером:**
   - Зараз відвідуваність прив'язана до ID на кшталт `mon_1_soft_comp_lab_1`. Якщо замінити розклад на дати з ЛНУ, `filterRecordsBySettings` у `attendanceMath.ts` перестане знаходити старі `lessonId` у новому `lessonsMap`, і історія відвідуваності «зникне» зі статистики.
   - **Міграційне рішення:**
     1) Зберігати для нових записів стабільні детерміновані `lessonId` (наприклад, `lnu:${groupKey}:${date}:${order}:${slug}` для датованих занять або сумісний ключ).
     2) Не видаляти наявні записи при зміні групи: у `StatsView` дозволяти перегляд статистики за поточним розкладом і зберігати сирі записи в резервній копії; старі записи `uni_schedule_attendance_v1` автоматично мігруються/підтягуються в синхронізацію без руйнування.
2. **Відсутність ідентичності користувача (анонімність vs безпека):**
   - Якщо відкрити endpoint без токена (`POST /api/profile?userId=...`), будь-хто зможе підмінити чужу підписку чи відвідуваність.
   - **Рішення:** при першому підключенні клієнт генерує або отримує криптографічно випадковий `syncToken` (256-bit) і зберігає його хеш (`SHA-256`) у таблиці `users` / `user_sessions`. Для перенесення профілю на інший пристрій можна передбачити одноразовий 6-символьний код прив'язки пристрою (або JSON-резервну копію).
3. **Web Push на iOS:**
   - Safari на iOS підтримує Web Push **лише** у режимі встановленого PWA на екран «Додому» (iOS 16.4+) і вимагає виклику `Notification.requestPermission()` виключно у прямому обробнику кліку користувача (`onClick`). UI повинен явно перевіряти `isStandalone` та `Notification` / `PushManager` і чесно підказувати користувачеві кроки на iOS.
4. **Залежність від HTML `dekanat.lnu.edu.ua`:**
   - При тимчасовій недоступності або зміні HTML парсер повинен кидати структуровану помилку, **ніколи** не перезаписувати кешований валідний розклад у D1 порожнім масивом і логувати інцидент у `schedule_sync_logs`.
5. **Зимовий/літній час (`Europe/Kyiv` DST):**
   - Розклад пар задається в локальному часі (`08:30`), а Cloudflare Cron працює в UTC. Не можна зберігати offset `+02:00` константою — обчислення локального часу користувача має використовувати `Intl.DateTimeFormat('en-CA', { timeZone: user.timezone, ... })` на кожному тіку планувальника.

---

## 8. Рекомендована архітектура

### 8.1. Взаємодія компонентів
```text
[Vercel Frontend PWA]  <--HTTPS/JSON + Bearer Token-->  [Cloudflare Worker API]
  - React + Vite                                          - Auth / Device Token middleware
  - LocalStorage cache + offline queue                    - University Adapters (LNU TS parser)
  - Service Worker (cache + push + click)                 - D1 Database (SQLite)
                                                          - Cron Trigger (every 5 min):
                                                              1) Sync active groups (1-2x/day)
                                                              2) Evaluate notifications per TZ
                                                              3) Send Web Push (VAPID JWT + WebCrypto)
```

> **Примітка про Web Push у Cloudflare Workers:** стандартний Node-пакет `web-push` часто потребує Node `https`/`crypto` модулів. У Workers Runtime оптимально використовувати нативний Web Crypto API (`crypto.subtle` ECDSA P-256 для VAPID JWT + ECDH + AES-128-GCM згідно з RFC 8291 / RFC 8292) або легку Web-Standards бібліотеку (`@block65/webcrypto-web-push`), що працює без Node-поліфілів і важить кілька кілобайт.

### 8.2. Схема бази даних Cloudflare D1 (SQLite)
1. `universities` (`id`, `name`, `short_name`, `adapter_type`, `is_active`)
2. `university_groups` (`id`, `university_id`, `faculty_id`, `faculty_name`, `course`, `group_code`, `external_id`, `last_synced_at`, `content_hash`)
3. `schedule_entries` (`id`, `group_id`, `lesson_date`, `day_of_week`, `pair_number`, `start_time`, `end_time`, `subject`, `lesson_type`, `teacher`, `room`, `building`, `subgroup`, `status`, `updated_at`) — індекс `(group_id, lesson_date, pair_number)`
4. `users` (`id`, `token_hash`, `created_at`, `last_seen_at`)
5. `student_profiles` (`user_id` PK/FK, `university_id`, `faculty_id`, `course`, `group_id`, `subgroup`, `elective_course`, `timezone`, `updated_at`)
6. `push_subscriptions` (`id`, `user_id` FK, `endpoint` UNIQUE, `p256dh`, `auth`, `user_agent`, `created_at`, `last_success_at`, `fail_count`)
7. `notification_preferences` (`user_id` PK/FK, `enabled`, `morning_enabled`, `morning_time`, `before_lesson_enabled`, `before_lesson_minutes`, `before_end_enabled`, `before_end_minutes`, `evening_enabled`, `evening_time`, `friday_enabled`, `updated_at`)
8. `notification_logs` (`id`, `user_id` FK, `dedup_key` UNIQUE, `type`, `sent_at`, `status`, `error_message`) — гарантія відсутності дублів при повторних Cron-запусках!
9. `attendance_records` (`user_id`, `lesson_id`, `lesson_date`, `status`, `updated_at`, `deleted_at`, PRIMARY KEY `(user_id, lesson_id, lesson_date)`)
10. `schedule_sync_logs` (`id`, `group_id`, `started_at`, `finished_at`, `status`, `entries_count`, `error_message`)

---

## 9. Оцінка навантаження та лімітів Cloudflare Free Tier

Безкоштовні ліміти Cloudflare (орієнтовні базові квоти Free Plan):
- **Workers Requests:** `100,000` запитів/день.
- **Workers CPU time:** `10 ms` CPU на HTTP/Cron invocation.
- **Cron Triggers:** до `5` Cron-тригерів на акаунт (оптимально 1 тригер `*/5 * * * *` = 288 запусків/день).
- **D1 Free Tier:** `5,000,000` row reads/день, `100,000` row writes/день, `5 GB` storage.

### Розрахунок для 1–500 активних користувачів (Cron кожні 5 хв = 288 тіків/день)

| Метрика / день | 1 юзер | 10 юзерів | 50 юзерів | 100 юзерів | 500 юзерів |
|---|---|---|---|---|---|
| **Push-сповіщень/день (~8/юзер)** | ~8 | ~80 | ~400 | ~800 | ~4,000 |
| **D1 Reads/день (з вибіркою активного вікна)** | ~2,000 | ~15,000 | ~70,000 | ~140,000 | ~700,000 |
| **D1 Writes/день (logs + sync + attendance)** | ~50 | ~350 | ~1,600 | ~3,200 | ~16,000 |
| **HTTP API запитів/день** | ~20 | ~200 | ~1,000 | ~2,000 | ~10,000 |
| **Головне вузьке місце** | — | — | — | — | **10 ms CPU на 1 Cron-тік** у пікові хвилини (08:00, за 10 хв до пар) |

**Критичний інженерний висновок:**
- По **D1 reads (5M/день)**, **D1 writes (100K/день)** і **Requests (100K/день)** система вільно витримує навіть 500 користувачів.
- **Перше реальне обмеження Free Tier — `10 ms` CPU time за один Cron-виклик** та ліміт одночасних вихідних `fetch()`-з'єднань на один invocation (до ~50 subrequests). Якщо о 08:00 або перед 1-ю парою потрібно надіслати push одразу 100–500 підпискам, один синхронний цикл у Cron може вперетися у `10 ms` CPU або subrequest limit.
- **Як вирішити архітектурно на старті (без платних Cloudflare Queues):**
  1. Відбирати SQL-запитом у D1 лише тих користувачів, чий локальний час зараз потрапляє у цільове вікно (не сканувати всіх!).
  2. Надсилати push пакетами (batching по ~25–30 підписок) із фіксацією у `notification_logs` — якщо за один 5-хвилинний тік оброблено першу порцію, наступний тік (або розділене 2–5 хв вікно) підхопить решту без дублікатів завдяки `dedup_key`.
  3. Розкласти синхронізацію груп на денні/нічні години окремо від пікових ранкових push-хвилин (наприклад, оновлення груп о 02:00–05:00 UTC по черзі тільки для `active` груп).

---

## 10. План реалізації за етапами

1. **Етап 1 (завершено цим документом):** Повний аудит і узгодження архітектури.
2. **Етап 2 — Університетські адаптери та вибір групи (Frontend + Shared Core):**
   - `src/integrations/universities/` (`types.ts`, `registry.ts`, `lnu/` парсер і нормалізатор, `normalizers/`).
   - Unit-тести парсера ЛНУ на збережених HTML-фікстурах (`windows-1251`, порожні пари, підгрупи, кілька пар в одному слоті, битий HTML).
   - UI вибору університету/факультету/курсу/групи у профілі + чесно маркований ручний/локальний режим для невідомих вишів.
3. **Етап 3 — Cloudflare Worker + D1 Backend:**
   - Підпроєкт `workers/api/` з `wrangler.toml`, D1-міграціями, авторизацією за `syncToken`, endpoints `/api/universities/*`, `/api/schedule`, `/api/profile`, `/api/sync`.
4. **Етап 4 — Web Push Notifications & Cron:**
   - VAPID-генерація та WebCrypto-відправка у Worker, `notification_logs` з `dedup_key`, Cron-планувальник кожні 5 хв з урахуванням `Europe/Kyiv` і DST.
   - Оновлення `public/sw.js` (`push`, `notificationclick`), блок «Сповіщення» в налаштуваннях із підтримкою iOS PWA сценарію.
5. **Етап 5 — Синхронізація відвідуваності:**
   - Двостороння офлайн-стійка синхронізація `attendance_records` (LWW за `updated_at`), точні вечірні та п'ятничні підсумки без запису невідмічених пар як пропущених.
6. **Етап 6 — Тестування, безпека та документація:**
   - Повні unit/E2E-тести, `.env.example`, `docs/SCHEDULE_INTEGRATION.md`, `docs/PUSH_NOTIFICATIONS.md`, `docs/DEPLOYMENT.md`, оновлення `docs/ARCHITECTURE.md`.
