# Звіт готовності продукту (Project Readiness Report)

Дата: `2026-11-19`  
Репозиторій: `/home/kostia/projects/rozklad/`

---

## 1. Поточний Git Baseline та стан робочого дерева
- **Активна гілка:** `feat/final-hardening`
- **`HEAD` commit:** `176f329324e7f3c9a739f0adbfd40514bf84bf17`
- **Гілка `main`:** `ed8205dd8d284fdcd7b6dbd2f9953b42ef829ccf` (не змінювалася)
- **Незакомічені зміни (Phase C, локально):**
  - `M workers/api/wrangler.toml` (`+18` рядків у секції `[env.staging]`; top-level production-конфігурація не змінювалася)
  - `?? docs/STAGING_DEPLOYMENT_PLAN.md`
  - `?? docs/STAGING_ENVIRONMENT.md`
  - `?? docs/STAGING_ROLLBACK_PLAN.md`
  - `?? docs/STAGING_SMOKE_TEST_CHECKLIST.md`
  - `?? docs/PROJECT_READINESS_REPORT.md`

---

## 2. Виконані етапи
- **Stages 1–6:** University Integrations (ЛНУ), Cloudflare Worker + D1, Web Push + Cron, Attendance Sync, Security Hardening & Docs.
- **Stage 7 & 7.1:** Локальна інтеграційна перевірка, D1 `FOREIGN KEY`/`UNIQUE`/`CHECK` constraints, 5 Cron-сценаріїв на реальній локальній D1, наскрізний 2-пристроєвий Offline Attendance Sync, 9-viewport Playwright E2E.
- **Stage 8 (Phases A–C):** Read-only аудит, проєктування ізольованого staging, додавання `[env.staging]` у `workers/api/wrangler.toml` та локальна регресія. **Phase E (віддалений деплой) не запускалася.**

---

## 3. Фактичні результати локальної регресії (після змін у `wrangler.toml`)

| Перевірка | Тип | Команда | Результат |
|---|---|---|---|
| Wrangler staging config | Static / Dry-run | `npx wrangler deploy --env staging --dry-run` | **PASSED** (`uni-schedule-staging`, `DB -> uni-schedule-staging-db`, `113.16 KiB`) |
| Wrangler default config | Static / Dry-run | `npx wrangler deploy --dry-run` | **PASSED** (`DB -> uni-schedule-db`, `113.16 KiB`, незмінений) |
| Worker TypeScript | Static | `(cd workers/api && npm run typecheck)` | **PASSED** (`0` помилок) |
| Frontend TypeScript & Build | Static / Build | `npm run build` | **PASSED** (`0` помилок, `5.71s`) |
| `tests/unit/domain.test.ts` | Unit | `node --test` | **PASSED** (`22/22`) |
| `tests/unit/lnuParser.test.ts` | Unit | `node --test` | **PASSED** (`8/8`) |
| `tests/unit/attendanceSyncClient.test.ts` | Unit | `node --test` | **PASSED** (`2/2`) |
| `workers/api/tests/api.test.ts` | Mock D1 | `node --test` | **PASSED** (`8/8`) |
| `workers/api/tests/push.test.ts` | Mock D1 + Unit | `node --test` | **PASSED** (`4/4`) |
| `workers/api/tests/attendanceSync.test.ts` | Mock D1 + Unit | `node --test` | **PASSED** (`2/2`) |
| `workers/api/tests/loadSimulation.test.ts` | Mock D1 + fetch | `node --test` | **PASSED** (`1/1`, 10/50/100/500 юзерів) |
| `workers/api/tests/localApiMatrix.test.mjs` | Real local D1 + Worker | `node --test` | **PASSED** (`1/1`, 20 endpoint-ів, `12.69s`) |
| `workers/api/tests/localD1ConstraintsAndCron.test.mjs` | Real local D1 + Push HTTP | `node --test` | **PASSED** (`2/2`: FK/UNIQUE/CHECK/rollback + 5 Cron-сценаріїв + DST) |
| `tests/e2e/verify_app.py` | Playwright E2E | `python tests/e2e/verify_app.py` | **PASSED** (усі 9 viewport `320×844`–`1920×900`, `0` помилок консолі) |
| `tests/e2e/verify_attendance_sync.py` | Playwright E2E + Worker + D1 | `python tests/e2e/verify_attendance_sync.py` | **PASSED** (2 пристрої, offline reload, черга, `unmarked`, `stale`, `2099`, `baseVersion`) |

---

## 4. Аудит конфігурації Staging (`workers/api/wrangler.toml`)
1. **Окрема назва Worker:** `name = "uni-schedule-staging"` під `[env.staging]`.
2. **Власний D1 binding:** `[[env.staging.d1_databases]]` (`binding = "DB"`, `database_name = "uni-schedule-staging-db"`, `database_id = "REPLACE_WITH_STAGING_D1_DATABASE_ID"`).
3. **Захист від підключення до production D1:** `[[env.staging.d1_databases]]` перевизначає `DB` на `uni-schedule-staging-db`; `--dry-run --env staging` підтвердив `env.DB (uni-schedule-staging-db)`.
4. **`vars`:** `[env.staging.vars]` задає `ALLOWED_ORIGINS` без wildcard (`http://localhost:5173,http://127.0.0.1:4173,https://uni-schedule-git-feat-final-hardening.vercel.app`), `SCHEDULE_CACHE_TTL_SECONDS = "21600"`, `GROUPS_CACHE_TTL_SECONDS = "86400"`.
5. **Незалежний Cron:** `[env.staging.triggers]` задає `crons = ["*/5 * * * *"]` незалежно від top-level `[triggers]`.
6. **Ізоляція секретів:** секрети (`TOKEN_PEPPER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) не успадковуються і не зберігаються в `wrangler.toml` — задаються окремо через `wrangler secret put --env staging`.
7. **Семантика Wrangler environments:** `[env.staging]` повністю ізольована; при `--env=""` або default зберігаються top-level налаштування.
8. **Конфлікти:** відсутні.

---

## 5. Security Audit
- **CORS allowlist:** перевіряється у `isOriginAllowed` та `resolveCorsHeaders` (`workers/api/src/security.ts`); невідомі origins блокуються з `403 FORBIDDEN_ORIGIN`, wildcard не використовується.
- **`TOKEN_PEPPER` & `syncToken`:** 256-бітний `ust_...` токен хешується через SHA-256 з `TOKEN_PEPPER` (`hashSyncToken`), у D1 зберігається лише хеш.
- **VAPID secrets:** зчитуються лише з `env`, приватний ключ ніколи не повертається в API або логах.
- **Authentication & Device linking:** `Bearer <syncToken>` перевіряється по `token_hash` і `revoked_at IS NULL`; ротація та відкликання ізольовані по `user_id`.
- **API validation & Rate limiting:** сувора валідація payload (`400`), `405` з `Allow`, D1 rate limiting (`20/хв` write/auth, `60/хв` read, `429` з `Retry-After`).
- **Error handling & Sensitive data:** глобальний `try/catch` повертає `500 INTERNAL_ERROR` без SQL/stack trace.
- **Production/staging isolation:** окремі Worker, D1, секрети, VAPID та Vercel Preview.
- **SW caching & Offline data:** `/sw.js` роздається з `no-cache, no-store, must-revalidate`; локальна черга `uni_schedule_attendance_queue_v1` містить лише статуси та timestamp без токенів; `syncToken` зберігається в `localStorage` пристрою.

---

## 6. Функціональна готовність (15 модулів)

| № | Модуль | Статус | Примітка |
|---|---|---|---|
| 1 | University selection | **Verified** | API + UI + E2E перевірено |
| 2 | LNU schedule integration | **Partially verified** | Парсер/кеш/fallback перевірені локально; live-запит до `dekanat.lnu.edu.ua` з Cloudflare Edge — на staging |
| 3 | Manual university/group fallback | **Verified** | Реєстр `manual_only` + локальний fallback перевірені |
| 4 | Schedule rendering | **Verified** | Playwright 9 viewport + unit-тести |
| 5 | Attendance tracking | **Verified** | UI + `useAttendance` + E2E |
| 6 | Cross-device attendance sync | **Verified** | 2 контексти Playwright + Worker + реальна локальна D1 |
| 7 | Offline mode | **Verified** | SW `v7`, `offline.html`, offline queue reload у Playwright |
| 8 | Notes and deadlines | **Verified** | CRUD + reload persistence у `verify_app.py` |
| 9 | Push notifications | **Partially verified** | VAPID/AES-128-GCM + локальний HTTP endpoint перевірено; фізичні Android/iOS пристрої — не тестувалися |
| 10 | Cron notifications | **Partially verified** | Усі 5 сценаріїв + DST перевірені на реальній локальній D1; реальний Cloudflare Cron Trigger — на staging |
| 11 | PWA installation | **Partially verified** | `manifest.json`, іконки, `sw.js` перевірені в Chromium; встановлення на реальний Android/iOS — не тестувалося |
| 12 | Settings and persistence | **Verified** | UI + експорт/імпорт JSON + API `/api/profile` |
| 13 | API reliability | **Verified** | 20 endpoint-ів × 6 сценаріїв на реальному локальному Worker |
| 14 | Database integrity | **Verified** | Міграції `0001`–`0004`, FK, UNIQUE, CHECK, NOT NULL, rollback на реальній D1 |
| 15 | Mobile usability | **Partially verified** | Перевірено viewport `320×844`–`430×844` у Playwright; реальний touch/iOS Safari — на staging |

---

## 7. Відомі проблеми та залишкові роботи

### A. Blockers (без них публічний запуск заборонений)
1. **Немає авторизації Cloudflare (`wrangler login`)** та не створена віддалена D1-база (`database_id` у `wrangler.toml` зараз placeholder).
2. **Не перевірено Web Push і PWA на фізичних Android Chrome та iOS Safari** (особливості iOS Push вимагають тесту на реальному iPhone через «На початковий екран»).
3. **Не підтверджено реальний Vercel Preview URL** у `[env.staging.vars].ALLOWED_ORIGINS` (зараз прописано очікуваний branch-URL).
4. **Не налаштовано production `database_id`, `TOKEN_PEPPER` та production VAPID-ключі** (до етапу production).

### B. Important (бажано до публічного запуску)
1. **Ліміт Cloudflare Workers Free Tier (`50` subrequests / `10 ms` CPU):** при `>50` активних Push-підписок у піковий Cron-слот 08:00 потрібен Workers Paid або batching через Cloudflare Queues.
2. **Live smoke-тест LNU (`dekanat.lnu.edu.ua`) із Cloudflare Edge IP** на staging.

### C. Optional (після першого релізу)
1. Додати в `GET /api/health` поле середовища (`env: 'staging' | 'production'`) для швидкої діагностики.
2. Розширити інтеграцію на інші університети окрім ЛНУ.

---

## 8. Оцінка часу
- **Завершення Phase C (коміт на `feat/final-hardening` після підтвердження):** ~`0.25 год`
- **Створення staging (Wrangler login, D1 create, секрети, деплой Worker + Vercel Preview):** ~`1–1.5 год`
- **Staging verification (smoke-тест API, LNU з Edge, Cron):** ~`1–2 год`
- **Фізичне тестування Android Chrome PWA:** ~`1 год`
- **Фізичне тестування iOS Safari PWA:** ~`1–2 год` (за наявності фізичного iPhone з iOS 16.4+)
- **Production security review (перевірка allowlist, секретів, Workers Paid/лімітів):** ~`1 год`
- **Production deployment + smoke-тест:** ~`1–1.5 год`
- **Разом до Staging (робочого):** ~`1.5–2 год` | **Разом до Production:** ~`1–1.5 робочих дні` (залежно від наявності пристроїв і проходження перевірки LNU з Cloudflare Edge).

---

## 9. Висновок
**Поточний статус:** **`READY FOR STAGING`**

*(Система повністю верифікована локально, staging-конфігурація ізольована та перевірена через `--dry-run`, production-конфігурація не зачеплена. Наступний крок — дозвіл на коміт Phase C та авторизований перехід до Phase E.)*
