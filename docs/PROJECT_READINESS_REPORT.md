# Звіт готовності проєкту (Project Readiness Report)

**Проєкт:** Uni Schedule (`v3.0.0`)  
**Дата:** `2026-11-19`  
**Репозиторій:** `/home/kostia/projects/rozklad/`

---

## 1. Git Baseline

- **Активна гілка:** `feat/final-hardening`
- **`HEAD` commit:** `9793ad55dcbfbaf8cfc530846aa9efe04963d0ba`
- **Версія / Тег:** `v3.0.0`
- **Гілка `main`:** не змінювалася (untouched)

---

## 2. Підсумок статусу готовності

**Фінальний статус:** **`STAGING DEPLOYED & VERIFIED (DESKTOP/API)`** *(Production залишається **`NOT READY`** до завершення фізичного тестування Android Chrome / iOS Safari PWA Push, перевірки живого Cron на фізичний пристрій, налаштування Production D1/секретів та усунення зауважень безпеки)*

- **Live Staging Backend & DB:** Worker `uni-schedule-staging` опублікований на `https://uni-schedule-staging.lev68819.workers.dev` (Version ID `bc458760-1cc6-42da-8966-3cab9dae27b5`, Cron `*/5 * * * *`), база `uni-schedule-staging-db` (`EEUR`, `migs=4`, `subs=0`) та секрети налаштовані.
- **Live Vercel Preview URL:** `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` (`dpl_4aZQz6iqMsxvvV1puVMCEHWKZr8G`, `readyState=READY`, `target=null` Preview; Inspect: `https://vercel.com/kokos96/uni-schedule/4aZQz6iqMsxvvV1puVMCEHWKZr8G`). Перевірено `/`, `/sw.js`, `/manifest.json` (`200 OK`) та CORS до staging API (`200 OK` з точним `Access-Control-Allow-Origin`; `https://evil.example` -> `403`).
- **Live Staging Smoke & E2E:** усі live HTTP-перевірки (включно з `dekanat.lnu.edu.ua` з Cloudflare Edge IP, CORS, Auth, Push CRUD, Attendance Sync, Device Revocation) та live 2-браузерний Playwright E2E проти живого Worker + віддаленої D1 **пройшли успішно**.
- **Залишкові пункти до Production:**
  1. Провести фізичне тестування **PWA, Web Push та живого Cron** на фізичному телефоні користувача (Android Chrome та iOS Safari) проти `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` (**`NOT VERIFIED`**).
  2. Налаштувати Production D1, Production секрети та закрити зауваження безпеки (Agent 5) перед production-релізом.

---

## 3. Матриця готовності модулів (17 модулів)

| № | Модуль | Статус | Підтвердження / Примітка |
|---|---|---|---|
| 1 | Вибір університету (University Selection) | **VERIFIED** | API + UI + E2E перевірені локально та на live staging (`GET /api/universities` -> `200`, `count=2`). |
| 2 | Інтеграція розкладу ЛНУ (`dekanat.lnu.edu.ua`) | **VERIFIED** | Live-запит з Cloudflare Edge IP підтверджено на `uni-schedule-staging`: `23` факультети (`881ms`), `304` групи (`307ms`), `64` пари (`lnu-live` `716ms` -> `d1-cache` `204ms`). |
| 3 | Ручний fallback університету/групи | **VERIFIED** | Реєстр `manual_only` та локальне введення перевірені в unit/E2E тестах. |
| 4 | Відображення розкладу (День / Тиждень / Live Pair) | **VERIFIED** | Unit-тести домену (`22/22`) та Playwright по 9 viewport (`320×844`–`1920×900`). |
| 5 | Облік відвідуваності (Attendance Tracking) | **VERIFIED** | UI, `useAttendance`, статистика та калькулятор цілі перевірені в `verify_app.py`. |
| 6 | Крос-пристроєвий Offline-first Attendance Sync | **VERIFIED** | Перевірено локально та наскрізно у live 2-браузерному Playwright проти `uni-schedule-staging` + віддаленої D1 (`serverVersion=1->2->3`). |
| 7 | Офлайн-режим та Service Worker | **VERIFIED** | `public/sw.js`, `/offline.html` та черга синхронізації після reload перевірені у Playwright (включно з live staging). |
| 8 | Нотатки та дедлайни | **VERIFIED** | CRUD-операції та збереження після перезавантаження перевірені у `verify_app.py`. |
| 9 | Web Push сповіщення | **PARTIALLY VERIFIED** | VAPID/AES-128-GCM та live staging CRUD (`POST` `201`, `GET` `200`, `DELETE` `200`) перевірені; фізичні Android Chrome / iOS Safari не тестувалися. |
| 10 | Cron-сценарії сповіщень (5 сценаріїв + DST) | **PARTIALLY VERIFIED** | Усі 5 сценаріїв і DST перевірені на реальній локальній D1 (`localD1ConstraintsAndCron`); живий Cloudflare Cron Trigger (`*/5 * * * *`) з реальною підпискою пристрою ще не тестувався. |
| 11 | Встановлення PWA | **PARTIALLY VERIFIED** | `manifest.json`, іконки та `sw.js` перевірені у Chromium; встановлення на реальні Android/iOS пристрої не тестувалося. |
| 12 | Налаштування та JSON v2 резервне копіювання | **VERIFIED** | Експорт/імпорт JSON та live `PUT /api/profile` (`200`) перевірені в UI та API-тестах. |
| 13 | Надійність API та валідація | **VERIFIED** | 20 endpoint-ів перевірені локально (`localApiMatrix`) та основні live staging сценарії на `uni-schedule-staging`. |
| 14 | Цілісність бази даних D1 | **VERIFIED** | Міграції `0001`–`0004`, FK, UNIQUE, CHECK, rollback перевірені локально; міграції `0001`–`0004` застосовані та верифіковані на `uni-schedule-staging-db` (`migs=4`, `subs=0`). |
| 15 | Мобільна адаптивність | **PARTIALLY VERIFIED** | Перевірено 9 viewport у Playwright; тестування на реальному сенсорному екрані / iOS Safari не проводилося. |
| 16 | Безпека, автентифікація та Rate Limiting | **PARTIALLY VERIFIED** | CORS allowlist (`403` / `200`), `TOKEN_PEPPER`, Bearer auth та відкликання пристрою (`401`) перевірені на live staging; 5 зауважень безпеки (Agent 5) потребують виправлення до production. |
| 17 | Віддалений Staging та Preview Deploy | **PARTIALLY VERIFIED** | **Staging Worker (`uni-schedule-staging`) та Vercel Preview URL (`https://uni-schedule-lw02zf1wk-kokos96.vercel.app`) = VERIFIED**; **Production Deploy = NOT READY** (очікує фізичного Push-тесту, Production D1/секретів та виправлення зауважень безпеки). |

---

## 4. Зміни Phase 5 (Stage 8 Hardening & Staging Setup)

- Налаштовано ізольоване середовище `[env.staging]` у `workers/api/wrangler.toml` (`workers_dev = true`, Cron `*/5 * * * *`) без зміни top-level production-конфігурації.
- Створено віддалену staging D1 базу `uni-schedule-staging-db` (`be373ae1-65ad-4243-96bf-5a7d9cf07aa2`, регіон `EEUR`), застосовано міграції `0001`–`0004` (`migs=4`, `subs=0`) та налаштовано staging-секрети (`TOKEN_PEPPER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`).
- На проєкті Vercel `uni-schedule` (`prj_aRRsDLY3V8YvE47OVUzG2VmyTgXj`) налаштовано `VITE_API_BASE_URL=https://uni-schedule-staging.lev68819.workers.dev` (ID `0coUCA7nLK18kjeL`) виключно для середовища `preview` та розгорнуто Vercel Preview (`https://uni-schedule-lw02zf1wk-kokos96.vercel.app`, `dpl_4aZQz6iqMsxvvV1puVMCEHWKZr8G`, `readyState=READY`, `target=null`).
- Додано `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` до `[env.staging.vars].ALLOWED_ORIGINS` та повторно опубліковано Worker `uni-schedule-staging` (`https://uni-schedule-staging.lev68819.workers.dev`, Version ID `bc458760-1cc6-42da-8966-3cab9dae27b5`).

---

## 5. Повна верифікація (Локальна + Live Staging)

| Перевірка | Команда / Набір | Результат | Час / Деталі |
|---|---|---|---|
| Live Vercel Preview & CORS | `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` -> `uni-schedule-staging` | **PASSED** | `/`, `/sw.js`, `/manifest.json` (`200 OK`); CORS на `/api/health`, `/api/push/vapid-public-key`, `/api/universities`, `/api/schedule?universityId=lnu&group=ФЕП-33с` (`200 OK`), `https://evil.example` (`403`) |
| Live Staging API & LNU Edge | `https://uni-schedule-staging.lev68819.workers.dev` | **PASSED** | Health, VAPID, Universities, LNU Edge (`23` фак., `304` гр., `64` пари), CORS, Auth, Push, Attendance Sync, Revocation |
| Live 2-Browser Playwright E2E | `http://127.0.0.1:4173` -> Live Staging Worker + D1 | **PASSED** (`6/6` кроків) | `serverVersion=1->2->3`, offline queue sync |
| TypeScript Unit & Worker тести | `node --test` (7 файлів) | **PASSED** (`47/47`) | — |
| Локальна API матриця (Real Worker + D1) | `workers/api/tests/localApiMatrix.test.mjs` | **PASSED** (`1/1`) | `16.93s` |
| Локальна D1 Constraints & 5 Cron-сценаріїв | `workers/api/tests/localD1ConstraintsAndCron.test.mjs` | **PASSED** (`2/2`) | `4.99s` |
| Playwright E2E (9 viewport) | `tests/e2e/verify_app.py` | **PASSED** | `57.42s` |
| Playwright E2E Attendance Sync (2 пристрої) | `tests/e2e/verify_attendance_sync.py` | **PASSED** | `18.50s` |
| Frontend TypeScript + Vite Build | `npm run build` | **PASSED** (`0` помилок) | `5.68s` |

---

## 6. Зауваження безпеки (Agent 5)

1. **`checkRateLimit` неатомарний:** виконує окремі `SELECT` та `UPDATE` у D1, що створює ризик race condition при конкурентних запитах.
2. **`push_subscriptions` без повної валідації:** відсутня перевірка hostname allowlist для `endpoint` (ризик SSRF / невалідних URL) та перевірка довжини ключів `p256dh` і `auth`.
3. **`TOKEN_PEPPER` fallback:** у коді присутній fallback на порожній рядок `""`, якщо секрет не заданий — для production потрібна fail-closed перевірка.
4. **Workers Free Tier ліміт:** обмеження `50` subrequests за одне виконання унеможливлює масову розсилку в Cron при `>50` активних підписників без Workers Paid або Cloudflare Queues.
5. **`ALLOWED_ORIGINS` у production default:** у `[vars]` (`workers/api/wrangler.toml`) досі присутні `http://localhost:5173,http://127.0.0.1:4173`.

---

## 7. Висновок

**Статус:** **`STAGING DEPLOYED & VERIFIED (DESKTOP/API)`** *(бекенд `uni-schedule-staging`, віддалена D1, LNU Edge інтеграція, Vercel Preview URL `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` та CORS повністю розгорнуті й верифіковані live; фізичний Android Chrome / iOS Safari PWA Push та доставка живого Cron на фізичні пристрої залишаються `NOT VERIFIED`, а Production — `NOT READY` до фізичного тесту Push, налаштування Production D1/секретів та закриття зауважень безпеки).*
