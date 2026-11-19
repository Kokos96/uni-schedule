# Звіт передпродакшн-верифікації (Stage 7 & 7.1 — Pre-Production Report)

Дата: `2026-11-19`  
Репозиторій: `/home/kostia/projects/rozklad/` (`https://github.com/Kokos96/uni-schedule`)

---

## 1. Git branch та commit
- Активна гілка: `feat/final-hardening`
- Базовий commit Stage 7: `b90724e75366c8690ef8099f03557da72f0223a7` (Stage 7.1 додає тести та оновлення звітів поверх нього).
- Гілка `main` не змінювалася (`ed8205dd8d284fdcd7b6dbd2f9953b42ef829ccf`), merge та production deployment не виконувалися.

## 2. Стан робочого дерева та `.gitignore`
- `.gitignore` захищає від коміту локальних БД та секретів: `.dev.vars`, `.dev.vars.*`, `!.dev.vars.example`, `*.pem`, `*.key`, `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-wal`, `*.db-shm`, `.wrangler/`, `workers/api/.wrangler/`, `.env`, `.env.*`.
- `package-lock.json` та залежності не змінювалися.

## 3. Версії Node.js, npm, Wrangler та компіляція
- **Системний Node.js у WSL:** `v18.19.1` (для `wrangler@4.x` використовується user-space Node у `~/.local/node/bin`).
- **User-space Node.js:** `v22.23.5` | **npm:** `10.9.9` | **Wrangler:** `4.48.0`.
- **Worker TypeScript check (`(cd workers/api && npm run typecheck)`):** `tsc --noEmit` — `0` помилок (**PASSED**, static check).
- **Frontend TypeScript check & Build (`npm run build`):** `tsc --noEmit && vite build` — `0` помилок, зібрано за `6.69s` (**PASSED**, static/build check).

## 4. D1-міграції, схема та реальні обмеження (FK / UNIQUE / CHECK / Rollback)
- **Команда міграцій:** `npx wrangler d1 migrations apply uni-schedule-db --local` — **PASSED** (`✅ No migrations to apply!` при повторному запуску; `0001_initial.sql` – `0004_attendance_versioning.sql` ідемпотентні, **real local D1**).
- **Схема `sqlite_master`:** підтверджено наявність **12** прикладних таблиць (`users`, `user_devices`, `universities`, `student_profiles`, `university_groups`, `schedule_entries`, `schedule_sync_logs`, `rate_limit_buckets`, `push_subscriptions`, `notification_preferences`, `notification_logs`, `attendance_records`, окрім системних `d1_migrations` і `_cf_METADATA`) та **9** індексів.
- **Перевірка реальних constraints та rollback:**
  - **Команда:** `node --test workers/api/tests/localD1ConstraintsAndCron.test.mjs` (тест №1)
  - **Тип:** `real local D1` (`getPlatformProxy` над ізольованою SQLite Wrangler D1)
  - **Результат:** **PASSED** (`ok 1`, `243 ms`) — реально відхилено порушення `FOREIGN KEY` (`user_devices`, `push_subscriptions`, `attendance_records`), `UNIQUE` (`user_devices.token_hash`, `attendance_records` PK), `CHECK` (`attendance_records.status`, `notification_preferences.before_lesson_minutes`), `NOT NULL` (`users.created_at`); підтверджено атомарний rollback через `db.batch()`, збереження базових записів після невдалих операцій та `ON DELETE CASCADE`.

## 5. Перевірка 20 API endpoint-ів на живому локальному Worker
- **Команда:** `node --test workers/api/tests/localApiMatrix.test.mjs`
- **Тип:** `real local D1` + живий `wrangler dev --local`
- **Результат:** **PASSED** (`1/1`, `14.72s`) — перевірено 20 endpoint-ів across 6 сценаріїв (`200/201`, `400`, `401`, `403`, `404`, `405` із `Allow`, `429 Retry-After=60`, IDOR-ізоляція, відсутність токенів у логах).

## 6. Наскрізна перевірка Attendance Sync та Offline Queue (Frontend + Worker + D1)
- **Команда:** `python tests/e2e/verify_attendance_sync.py`
- **Тип:** `real local D1` + живий `wrangler dev --local` + реальний `vite preview` + Playwright (2 окремі браузерні контексти `DevA` і `DevB`)
- **Результат:** **PASSED** (`ALL E2E OFFLINE ATTENDANCE SYNC CHECKS PASSED!`):
  1. `DevA` створює `attended` ("Був") -> D1 `serverVersion=1`.
  2. `DevB` завантажує застосунок -> бачить `attended`.
  3. `DevB` змінює на `absent` ("Н-ка") -> D1 `serverVersion=2`.
  4. `DevA` оновлюється -> бачить `absent`.
  5. `DevA` переходить `offline` (`ctx_a.set_offline(True)`) -> змінює на `excused` ("Поважна") -> мутація у `uni_schedule_attendance_queue_v1`.
  6. `DevA` перезавантажує PWA offline -> `excused` та черга збережені.
  7. `DevA` повертається `online` -> черга синхронізується з D1 (`serverVersion=3`), `uni_schedule_attendance_queue_v1` очищується.
  8. Повторна мутація -> `applied=0, skippedOlder=1`, 0 дублікатів, стан збережено.
  9. Окремо на реальній D1 підтверджено: `unmarked` (`serverVersion=4` + синхронізація на `DevB`), `stale mutation` (`applied=0, skippedOlder=1`), `clock skew` (`2099-01-01` обрізано `< 2030-01-01`, `serverVersion=5`) та `baseVersion=5` -> `serverVersion=6`.
- **Додаткові unit/mock тести Sync:**
  - `tests/unit/attendanceSyncClient.test.ts` (**unit**, `2/2` passed) — offline coalescing, міграція `uni_schedule_attendance_v1`.
  - `workers/api/tests/attendanceSync.test.ts` (**mock D1 + unit**, `2/2` passed) — LWW-конфлікти, IDOR та точність підсумків.

## 7. Повна перевірка п'яти Cron-сценаріїв та Push на реальній локальній D1
- **Команда:** `node --test workers/api/tests/localD1ConstraintsAndCron.test.mjs` (тест №2)
- **Тип:** `real local D1` (`getPlatformProxy`) + реальний локальний HTTP Push receiver (`127.0.0.1`) + реальний WebCrypto VAPID JWT / `aes128gcm`
- **Результат:** **PASSED** (`ok 2`, `1044 ms`):
  1. **Morning digest (`morning`):** `2026-11-20T06:00:00Z` (`08:00 Europe/Kyiv`) -> `sent=1`, запит доставлено на `/push/active`, запис у `notification_logs` (`dedup_key=sub-active:morning:2026-11-20`); повтор о `06:02Z` -> `sent=0, deduplicated=1`.
  2. **Before-class reminder (`before_lesson`):** `06:20Z` (`08:20 Europe/Kyiv`) -> `sent=1`, `dedup_key=sub-active:before_lesson:2026-11-20:l-fri-1@08:30`; повтор -> `sent=0, deduplicated=1`.
  3. **Before-end reminder (`before_end`):** `07:40Z` (`09:40 Europe/Kyiv`) -> `sent=1`, `dedup_key=sub-active:before_end:2026-11-20:l-fri-1@09:50`; повтор -> `sent=0, deduplicated=1`.
  4. **Friday digest (`friday`):** `16:00Z` (`18:00 Europe/Kyiv`) -> `sent=1`, `dedup_key=sub-active:friday:2026-11-20`; повтор -> `sent=0, deduplicated=1`.
  5. **Evening summary (`evening`):** `18:00Z` (`20:00 Europe/Kyiv`) -> `sent=1`, `dedup_key=sub-active:evening:2026-11-20`; повтор -> `sent=0, deduplicated=1`.
  - **Вимкнений користувач (`enabled=0`):** `0` записів у `notification_logs`, `0` Push-запитів.
  - **Часові пояси та DST на реальній D1:** підтверджено `Europe/Kyiv` літній час (`2026-07-17T05:00:00Z` = `08:00` UTC+3) та `America/New_York` зима/літо (`2026-01-16T13:00:00Z` UTC-5, `2026-07-17T12:00:00Z` UTC-4).
- **Додаткові mock/unit тести Push:** `workers/api/tests/push.test.ts` (**mock D1 + mock fetch + unit**, `4/4` passed) — retry `503`, видалення `410`.

## 8. Інші unit, E2E та навантажувальні тести
- `tests/unit/domain.test.ts` (**unit**, `22/22` passed).
- `tests/unit/lnuParser.test.ts` (**unit**, `8/8` passed) — `cp1251`, парсинг ЛНУ, стабільний `lessonId`.
- `workers/api/tests/api.test.ts` (**mock D1**, `8/8` passed) — кеш розкладу та fallback при `503`.
- `workers/api/tests/loadSimulation.test.ts` (**mock D1 + mock fetch**, `1/1` passed): `10` (`115 ms`), `50` (`251 ms`), `100` (`379 ms`), `500` (`1826 ms`).
- `python tests/e2e/verify_app.py` (**E2E**, 9 viewport `320×844` – `1920×900`, `ALL E2E CHECKS PASSED!`).

## 9. Непроведені перевірки (потребують staging / production середовища)
- **Реальна доставка Web Push на фізичні iPhone (iOS PWA) / Android:** не проводилася локально (потрібен HTTPS Worker та реальні пристрої).
- **Реальне навантажувальне тестування на Cloudflare Edge:** не проводилося (заборонено деплоїти віддалені ресурси; на Free Tier при `>50` підписок у пік діятиме ліміт subrequests/CPU).

## 10. Команди для повторного запуску локальної верифікації
```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /home/kostia/projects/rozklad
(cd workers/api && npm run typecheck)
npm run build
node --test workers/api/tests/localApiMatrix.test.mjs
node --test workers/api/tests/localD1ConstraintsAndCron.test.mjs
python tests/e2e/verify_app.py
python tests/e2e/verify_attendance_sync.py
```
