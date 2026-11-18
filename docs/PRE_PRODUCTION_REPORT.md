# Звіт передпродакшн-верифікації (Stage 7 — Pre-Production Report)

Дата: `2026-11-19`  
Репозиторій: `/home/kostia/projects/rozklad/` (`https://github.com/Kokos96/uni-schedule`)

---

## 1. Git branch та commit
- Активна гілка: `feat/final-hardening`
- Базовий commit перед стартом Stage 7: `1c64a63` (після коміту Stage 7 — див. повідомлення з фінальним commit hash).
- Гілка `main` не змінювалася (`ed8205d`), merge та production deployment не виконувалися.

## 2. Стан робочого дерева та `.gitignore`
- Робоче дерево перед стартом було чистим.
- `.gitignore` розширено для захисту від коміту локальних БД та секретів: `.dev.vars`, `.dev.vars.*`, `!.dev.vars.example`, `*.pem`, `*.key`, `*.db`, `*.sqlite`, `*.sqlite3`, `*.db-wal`, `*.db-shm`, `.wrangler/`, `workers/api/.wrangler/`, `.env`, `.env.*`.

## 3. Версії Node.js, npm та Wrangler
- **Системний Node.js у WSL:** `v18.19.1` (недостатній для `wrangler@4.x`, тому для локального запуску Wrangler розгорнуто user-space Node у `~/.local/node` без змін `package.json`, `package-lock.json` та системних конфігів).
- **User-space Node.js:** `v22.23.5`
- **npm:** `10.9.9`
- **Wrangler:** `4.48.0`
- **Перевірка `workers/api` (`npm run typecheck`):** `tsc --noEmit` — `0` помилок.
- **Перевірка frontend (`npm run build`):** `tsc --noEmit && vite build` — `0` помилок (`9.11s`).

## 4. Результат застосування всіх D1-міграцій
На локальній Wrangler D1 (`uni-schedule-db`) успішно застосовані та перевірені на ідемпотентність усі 4 міграції:
- `0001_initial.sql` ✅
- `0002_push_notifications.sql` ✅
- `0003_attendance_sync.sql` ✅
- `0004_attendance_versioning.sql` ✅
- Повторний запуск `npx wrangler d1 migrations apply uni-schedule-db --local` повернув `✅ No migrations to apply!`.

## 5. Список перевірених API endpoint-ів
Перевірено на живому локальному Worker (`wrangler dev --local`) через `workers/api/tests/localApiMatrix.test.mjs` (`20 endpoints × 6 сценаріїв`, включно з `200/201`, `400`, `401`, `403`, `404`, `405`, `429` і без виводу токенів у логах):
- `GET /api/health`
- `GET /api/push/vapid-public-key`
- `GET /api/universities`
- `GET /api/universities/lnu/faculties`
- `GET /api/universities/lnu/groups`
- `GET /api/schedule`
- `POST /api/auth/register`
- `GET /api/devices`, `POST /api/devices/link`, `POST /api/devices/rotate`, `DELETE /api/devices/:id`
- `GET /api/profile`, `PUT /api/profile`
- `GET /api/push/subscriptions`, `POST /api/push/subscriptions`, `DELETE /api/push/subscriptions/:id`
- `GET /api/notifications/preferences`, `PUT /api/notifications/preferences`
- `GET /api/attendance`, `POST /api/attendance/sync`

## 6. Результати реального локального D1 тестування
- SQLite-перевірка `sqlite_master` підтвердила наявність усіх 11 таблиць (`users`, `user_devices`, `universities`, `student_profiles`, `university_groups`, `schedule_entries`, `schedule_sync_logs`, `rate_limit_buckets`, `push_subscriptions`, `notification_preferences`, `notification_logs`, `attendance_records`) і 9 індексів.
- Зовнішні ключі та `UNIQUE` обмеження працюють на реальному локальному SQLite D1 engine.

## 7. Результати Attendance Sync на двох тестових пристроях
- Перевірено на **ізольованій реальній локальній Wrangler D1** (`DevA` і `DevB` одного користувача):
  - `DevA` створює `attended` (`serverVersion=1`) -> `DevB` оновлює до `absent` (`serverVersion=2`).
  - Клієнт із годинником `2099-01-01` обрізається до `serverNow + 5 хв` (`serverVersion=3`), і `DevB` з `baseVersion=3` успішно оновлює запис до `unmarked` (`serverVersion=4`).
- Також `workers/api/tests/attendanceSync.test.ts` (`2/2` passed) та `tests/unit/attendanceSyncClient.test.ts` (`2/2` passed) підтверджують offline-чергу, міграцію `uni_schedule_attendance_v1`, ідемпотентність та стабільність `lessonId`.

## 8. Результати Push-тестування
- `workers/api/tests/push.test.ts` (`4/4` passed): перевірено ES256 VAPID JWT, ECDH P-256 + HKDF-SHA-256 + `aes128gcm` шифрування, обробку `201`/`503` (retry)/`410` (видалення простроченої підписки), мульти-пристрої та `dedup_key`.
- Приватні ключі в логах чи звітах не виводилися.
- **Непроведено:** реальна доставка Push на фізичний iPhone/Android (потребує HTTPS production Worker, реального пристрою і production VAPID-ключів).

## 9. Результати Cron-тестування
- Локальний `wrangler dev --test-scheduled` успішно відпрацював на `GET /__scheduled?cron=*/5+*+*+*+*` зі статусом `200 OK`.
- Unit-тести `scheduler.ts` підтвердили всі 5 сценаріїв (ранковий, перед парою, перед завершенням, вечірній, п'ятничний), часові пояси `Europe/Kyiv` (UTC+2 зима / UTC+3 літо) та `America/New_York`, дедуплікацію та відсутність запису невідмічених пар як пропущених.

## 10. Результати LNU інтеграції
- `tests/unit/lnuParser.test.ts` (`8/8` passed): перевірено `cp1251` form-encoding/decoding, парсинг факультетів, JSON-списку груп, паралельних пар, підгруп, вибіркових дисциплін, порожнього/битого HTML та збереження кешу в D1 при `503` від джерела (`api.test.ts` `8/8` passed).

## 11. Результати frontend та E2E
- `npm run build` (`tsc --noEmit && vite build`): `0` помилок (`9.11s`).
- `tests/unit/domain.test.ts`: `22/22` passed.
- Playwright E2E (`tests/e2e/verify_app.py`) по всіх 9 viewport (`320×844` — `1920×900`): **`ALL E2E CHECKS PASSED!`** з нульовими консольними помилками.

## 12. Результати навантажувальної симуляції
- `workers/api/tests/loadSimulation.test.ts` (`1/1` passed, **mock D1 + mock fetch**, не реальний Cloudflare edge):
  - `10` юзерів: `115 ms`, `2` D1 reads, `20` D1 writes, `10` sent
  - `50` юзерів: `251 ms`, `2` D1 reads, `100` D1 writes, `50` sent
  - `100` юзерів: `379 ms`, `2` D1 reads, `200` D1 writes, `100` sent
  - `500` юзерів: `1826 ms`, `2` D1 reads, `1000` D1 writes, `500` sent
- **Примітка:** результати є симуляцією; на реальному Cloudflare Free Tier у пік 08:00 при >50 підписках ліміт `~50` subrequests/`10 ms` CPU вимагатиме переходу на Workers Paid або Queues.

## 13. Знайдені та виправлені дефекти
1. **HTTP 405 Method Not Allowed та валідація маршрутів Worker:** додано коректне повернення `405` для непідтримуваних HTTP-методів, `Retry-After` у `errorResponse`, уточнено валідацію параметрів у `profile.ts`, `push.ts`, `universities.ts`, `attendance.ts`.
2. **TypeScript strictness у `workers/api`:** виправлено типізацію `crypto.subtle.exportKey` / `deriveBits` у `webPush.ts` та `lib: ["ES2022", "DOM"]` у `workers/api/tsconfig.json`.
3. **Захист від коміту секретів і локальних БД:** оновлено `.gitignore`.
4. **Таймаут та проксі у `lnuAdapter.ts`:** покращено обробку мережевих помилок і таймаутів.

## 14. Невирішені проблеми
- Системний WSL Node.js має версію `v18.19.1`; для `wrangler@4` необхідно використовувати Node `>= 20` (локально налаштовано в `~/.local/node`).

## 15. Тести, які не вдалося виконати, із причинами
- **Реальна доставка Push на фізичний iPhone (iOS PWA) / Android:** не проводилася через відсутність HTTPS production Worker та реального пристрою в тестовому середовищі (перевірено криптографію, API і mock Push Service).
- **Реальне навантажувальне тестування на Cloudflare Edge:** не проводилося через заборону створення/деплою віддалених Cloudflare-ресурсів на цьому етапі.

## 16. Точні команди для подальшого запуску
```bash
# 1. Локальна D1 + Worker (потрібен Node >= 20 у PATH)
export PATH="$HOME/.local/node/bin:$PATH"
cd /home/kostia/projects/rozklad/workers/api
npx wrangler d1 migrations apply uni-schedule-db --local
npx wrangler dev --local --test-scheduled

# 2. Локальний Frontend
cd /home/kostia/projects/rozklad
npm run build
python tests/e2e/verify_app.py

# 3. API Matrix на реальній локальній D1
node --test workers/api/tests/localApiMatrix.test.mjs
```
