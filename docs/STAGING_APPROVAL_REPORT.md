# Фінальний звіт погодження Staging Deployment (Stage 8.1 — Staging Approval Report)

Дата: `2026-11-19`  
Репозиторій: `/home/kostia/projects/rozklad/`

---

## 1. Git Baseline та підготовка коміту
- **Поточна гілка:** `feat/final-hardening` (`main` не змінювалася: `ed8205dd8d284fdcd7b6dbd2f9953b42ef829ccf`)
- **Базовий `HEAD`:** `176f329324e7f3c9a739f0adbfd40514bf84bf17`
- **Рекомендований commit (не виконано, очікує дозволу):**
  `feat(staging): prepare isolated staging environment`
- **Точний список файлів, що увійдуть у коміт (7 файлів):**
  1. `workers/api/wrangler.toml` *(modified, `+18` рядків у `[env.staging]`)*
  2. `docs/STAGING_DEPLOYMENT_PLAN.md` *(new)*
  3. `docs/STAGING_ENVIRONMENT.md` *(new)*
  4. `docs/STAGING_ROLLBACK_PLAN.md` *(new)*
  5. `docs/STAGING_SMOKE_TEST_CHECKLIST.md` *(new)*
  6. `docs/PROJECT_READINESS_REPORT.md` *(new)*
  7. `docs/STAGING_APPROVAL_REPORT.md` *(new)*

---

## 2. Final Diff Review
- Top-level (production) секція `workers/api/wrangler.toml` (`name = "uni-schedule-api"`, `database_name = "uni-schedule-db"`, `[vars]`, `[triggers]`) **не змінена**.
- У diff відсутні секрети, `.dev.vars`, `.env*`, локальні БД, wildcard-origins (`*`) та незаплановані зміни коду.

---

## 3. Результати локальних тестів (після змін у `wrangler.toml`)
Усі перевірки пройшли без помилок:
- `npx wrangler deploy --env staging --dry-run`: **PASSED** (`uni-schedule-staging`, `env.DB -> uni-schedule-staging-db`, `113.16 KiB`)
- `npx wrangler deploy --dry-run`: **PASSED** (`env.DB -> uni-schedule-db`, `113.16 KiB`)
- `(cd workers/api && npm run typecheck)`: **PASSED** (`0` помилок)
- `npm run build` (`tsc --noEmit && vite build`): **PASSED** (`0` помилок, `5.71s`)
- Unit-тести (`domain.test.ts` `22/22`, `lnuParser.test.ts` `8/8`, `attendanceSyncClient.test.ts` `2/2`): **PASSED**
- Worker тести (`api.test.ts` `8/8`, `push.test.ts` `4/4`, `attendanceSync.test.ts` `2/2`, `loadSimulation.test.ts` `1/1`): **PASSED**
- Реальний локальний Worker + D1 (`localApiMatrix.test.mjs` `1/1`, `localD1ConstraintsAndCron.test.mjs` `2/2`): **PASSED**
- Playwright E2E (`verify_app.py` по 9 viewport + `verify_attendance_sync.py` 2 пристрої та offline queue): **PASSED**

---

## 4. Cron Safety Review
- Staging Worker (`uni-schedule-staging`) підключений виключно до порожньої бази `uni-schedule-staging-db` (`[[env.staging.d1_databases]]`).
- `runNotificationCron` зчитує підписки лише з `env.DB` -> **ризик надсилання сповіщень реальним production-користувачам відсутній**.
- Тестові підписки ізольовані у staging D1 з окремими staging VAPID-ключами.
- Повторні запуски захищені атомарною дедуплікацією (`INSERT OR IGNORE INTO notification_logs` за `UNIQUE dedup_key`).
- Staging Cron незалежний (`[env.staging.triggers]`) і може бути вимкнений окремо (`crons = []` + `npx wrangler deploy --env staging`) без впливу на production.

---

## 5. CORS & Vercel Safety Review
- У `[env.staging.vars]` задано явний список `ALLOWED_ORIGINS = "http://localhost:5173,http://127.0.0.1:4173,https://uni-schedule-git-feat-final-hardening.vercel.app"` (без wildcard `*`; `localhost:5173` і `127.0.0.1:4173` залишено для локальної перевірки проти staging).
- Preview-змінна `VITE_API_BASE_URL` у Vercel має бути обмежена лише середовищем **Preview** (гілка `feat/final-hardening`) — це не зачіпає Production deployment, який має власні змінні оточення.

---

## 6. Database Isolation Review
- Staging має власний D1 binding (`[[env.staging.d1_databases]]`, `binding = "DB"`, `database_name = "uni-schedule-staging-db"`, placeholder `REPLACE_WITH_STAGING_D1_DATABASE_ID`).
- Production D1 (`uni-schedule-db`) у staging не використовується; міграції `0001`–`0004` застосовуються лише з `--env staging --remote`; production-дані в staging не імпортуються.

---

## 7. Відомі ризики
1. `npx wrangler whoami` зараз не авторизований — потрібна OAuth-авторизація (`wrangler login`).
2. Точний Vercel Preview URL може відрізнятися залежно від slug проєкту/команди Vercel — його слід звірити після першого Preview-білду та за потреби оновити в `ALLOWED_ORIGINS`.
3. `dekanat.lnu.edu.ua` ще не перевірявся з Cloudflare Edge IP (можливі мережеві обмеження/таймаути на стороні ЛНУ).
4. На Workers Free Tier при `>50` підписок у пік діятиме ліміт subrequests/CPU (для масового staging-навантаження не актуально).

---

## 8. Необхідні ресурси та точні команди Phase E
**Ресурси до створення:**
- Cloudflare D1: `uni-schedule-staging-db`
- Cloudflare Worker: `uni-schedule-staging`
- Staging секрети (через CLI): `TOKEN_PEPPER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Vercel Preview env var: `VITE_API_BASE_URL` (Preview, branch `feat/final-hardening`)

**Точні команди Phase E (виконувати лише після дозволу):**
```bash
export PATH="$HOME/.local/node/bin:$PATH"
cd /home/kostia/projects/rozklad/workers/api
npx wrangler login
npx wrangler d1 create uni-schedule-staging-db
# Підставити отриманий database_id у [[env.staging.d1_databases]] у workers/api/wrangler.toml
npx wrangler d1 migrations apply uni-schedule-staging-db --env staging --remote
npx web-push generate-vapid-keys
npx wrangler secret put TOKEN_PEPPER --env staging
npx wrangler secret put VAPID_PUBLIC_KEY --env staging
npx wrangler secret put VAPID_PRIVATE_KEY --env staging
npx wrangler secret put VAPID_SUBJECT --env staging
npx wrangler deploy --env staging
```

---

## 9. Rollback Plan
- **Вимкнути staging Cron:** поставити `crons = []` у `[env.staging.triggers]` та виконати `npx wrangler deploy --env staging`.
- **Видалити staging Worker:** `npx wrangler delete --name uni-schedule-staging --env staging`.
- **Відкотити frontend:** видалити/змінити Preview-змінну `VITE_API_BASE_URL` у Vercel або відкотити Preview deployment. Детально у `docs/STAGING_ROLLBACK_PLAN.md`.
