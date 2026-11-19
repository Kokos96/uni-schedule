# Результати Smoke-тестування Staging (Staging Smoke Test Results)

**Дата:** `2026-11-19`  
**Базовий коміт:** `9793ad55dcbfbaf8cfc530846aa9efe04963d0ba` (`feat/final-hardening`)  
**Live Staging Worker:** `https://uni-schedule-staging.lev68819.workers.dev` (Version ID: `bc458760-1cc6-42da-8966-3cab9dae27b5`)  
**Live Vercel Preview URL:** `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` (`dpl_4aZQz6iqMsxvvV1puVMCEHWKZr8G`, `readyState=READY`, `target=null`)  
**Статус:** **`STAGING DEPLOYED & VERIFIED (DESKTOP/API)`**

---

## 1. Live Staging API Smoke-тести (Agent 4)

Усі перевірки нижче виконані напряму проти опублікованого `https://uni-schedule-staging.lev68819.workers.dev` та віддаленої бази `uni-schedule-staging-db`:

### 1.1. Базові endpoint-и та LNU з Cloudflare Edge

| Перевірка | Запит | Результат | Деталі |
|---|---|---|---|
| Health Check | `GET /api/health` | **VERIFIED (`200`)** | `246ms`, `ok=true` |
| VAPID Public Key | `GET /api/push/vapid-public-key` | **VERIFIED (`200`)** | `publicKey.length=87` |
| Universities List | `GET /api/universities` | **VERIFIED (`200`)** | `count=2` |
| LNU Faculties (Edge) | `GET /api/universities/lnu/faculties` | **VERIFIED (`200`)** | `23` факультети, `881ms` |
| LNU Groups (Edge) | `GET /api/universities/lnu/groups?facultyId=1005&course=3` | **VERIFIED (`200`)** | `304` групи, `307ms` |
| LNU Schedule (Edge -> D1 Cache) | `GET /api/schedule?universityId=lnu&group=ФЕП-33с` | **VERIFIED (`200`)** | `64` пари; `lnu-live` `716ms` -> `d1-cache` `204ms` |

### 1.2. CORS, Auth, Push, Attendance Sync та Device Lifecycle

| Сценарій | Перевірені запити / дії | Результат |
|---|---|---|
| CORS Allowlist | `Origin: https://evil.example` -> `403`; `Origin: https://uni-schedule-git-feat-final-hardening.vercel.app` -> `200` із заголовком `Access-Control-Allow-Origin` | **VERIFIED** |
| Auth & Device Linking | Реєстрація / прив'язка пристрою через `syncToken` (повні токени не логуються) | **VERIFIED** |
| Profile Update | `PUT /api/profile` | **VERIFIED (`200`)** |
| Web Push Subscription CRUD | `POST` -> `201`, `GET` -> `200`, `DELETE` -> `200` | **VERIFIED** |
| Notification Preferences | Оновлення налаштувань (`enabled: false`) | **VERIFIED (`200`)** |
| Attendance Sync (LWW & Clamp) | `attended` (`v1`) -> `absent` (`v2`) -> stale запит (`skippedOlder=1`) -> `2099` clamped (`v3`) -> `unmarked` з `baseVersion=3` (`v4`) -> `GET` (`records=1`) | **VERIFIED** |
| Device Revocation | `DELETE` пристрою -> `200`; повторний запит із відкликаним токеном -> `401` | **VERIFIED** |

### 1.3. Live 2-Browser Playwright E2E проти Staging Worker + Remote D1

- **Середовище:** локальний production-preview збірки фронтенду (`http://127.0.0.1:4173`, зібраний із `VITE_API_BASE_URL=https://uni-schedule-staging.lev68819.workers.dev`) проти живого Worker та віддаленої D1.
- **Результат:** усі **6 кроків** пройдено успішно (**VERIFIED (`PASSED`)**):
  - крос-пристроєва синхронізація версій `serverVersion=1 -> 2 -> 3`;
  - офлайн-черга змін збереглася після перезавантаження сторінки та успішно синхронізувалася при відновленні мережі.

### 1.4. Live Vercel Preview URL та CORS-перевірка

Перевірено на живому Vercel Preview (`https://uni-schedule-lw02zf1wk-kokos96.vercel.app`) у зв'язці з повторно задеплоєним `uni-schedule-staging` (Version ID `bc458760-1cc6-42da-8966-3cab9dae27b5`, із доданим origin у `[env.staging.vars].ALLOWED_ORIGINS`):

| Перевірка | Запит / Умова | Результат | Деталі |
|---|---|---|---|
| Preview Root HTML | `GET https://uni-schedule-lw02zf1wk-kokos96.vercel.app/` | **VERIFIED (`200 OK`)** | Сторінка завантажується |
| Service Worker | `GET https://uni-schedule-lw02zf1wk-kokos96.vercel.app/sw.js` | **VERIFIED (`200 OK`)** | `Cache-Control: no-cache, no-store, must-revalidate`, `Service-Worker-Allowed: /` |
| Web App Manifest | `GET https://uni-schedule-lw02zf1wk-kokos96.vercel.app/manifest.json` | **VERIFIED (`200 OK`)** | `Content-Type: application/manifest+json; charset=utf-8` |
| CORS Allowlist (Live Preview Origin) | `Origin: https://uni-schedule-lw02zf1wk-kokos96.vercel.app` до `/api/health`, `/api/push/vapid-public-key`, `/api/universities`, `/api/schedule?universityId=lnu&group=ФЕП-33с` | **VERIFIED (`200 OK`)** | Повертається точний заголовок `Access-Control-Allow-Origin: https://uni-schedule-lw02zf1wk-kokos96.vercel.app` |
| CORS Deny (Untrusted Origin) | `Origin: https://evil.example` | **VERIFIED (`403`)** | Доступ заблоковано |

---

## 2. Локальна регресія та віддалена D1

| Перевірка | Обсяг | Результат | Час |
|---|---|---|---|
| TypeScript Unit & Worker Tests | `47/47` тестів (домен, парсер ЛНУ, sync-клієнт, API, Push, Attendance Sync, load simulation) | **VERIFIED (`PASSED`)** | — |
| `workers/api/tests/localApiMatrix.test.mjs` | `1/1` (повна матриця endpoint-ів на локальному Worker + D1) | **VERIFIED (`PASSED`)** | `16.93s` |
| `workers/api/tests/localD1ConstraintsAndCron.test.mjs` | `2/2` (FK/UNIQUE/CHECK/rollback + 5 Cron-сценаріїв + DST) | **VERIFIED (`PASSED`)** | `4.99s` |
| `tests/e2e/verify_app.py` | Playwright E2E по 9 viewport | **VERIFIED (`PASSED`)** | `57.42s` |
| `tests/e2e/verify_attendance_sync.py` | Playwright E2E: 2 пристрої, offline reload, черга синхронізації | **VERIFIED (`PASSED`)** | `18.50s` |
| `npm run build` | `tsc --noEmit && vite build` | **VERIFIED (`PASSED`)** | `5.68s` |
| Віддалена D1 (`uni-schedule-staging-db`) | `be373ae1-65ad-4243-96bf-5a7d9cf07aa2` (`EEUR`): міграції `0001`–`0004` (`migs=4`, `subs=0`) | **VERIFIED** | — |

---

## 3. Залишається неперевіреним (NOT VERIFIED)

| Перевірка | Статус | Причина |
|---|---|---|
| Фізична доставка Web Push & PWA (Android Chrome, iOS Safari) | **NOT VERIFIED** | Потребує тестування живого Preview URL (`https://uni-schedule-lw02zf1wk-kokos96.vercel.app`) на фізичному телефоні користувача. |
| Виконання живого Cloudflare Cron Trigger (`*/5 * * * *`) з реальною підпискою пристрою | **NOT VERIFIED** | Логіка 5 Cron-сценаріїв і DST перевірена локально (`localD1ConstraintsAndCron`), але реальна доставка Cron на фізичний пристрій ще не тестувалася. |
