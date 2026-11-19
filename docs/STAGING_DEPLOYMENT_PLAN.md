# План Staging Deployment (Stage 8 — Uni Schedule)

## Статус етапів
- **Verified locally:** Stage 7 & 7.1 (`176f329324e7f3c9a739f0adbfd40514bf84bf17` на `feat/final-hardening`).
- **Verified remotely:** жодна віддалена операція ще не виконувалась.
- **Blocked pending approval:** авторизація Wrangler (`wrangler login`), створення staging D1 (`uni-schedule-staging-db`), завантаження staging-секретів, застосування віддалених міграцій, деплой staging Worker (`uni-schedule-staging`) та налаштування Vercel Preview (`VITE_API_BASE_URL`).

## Послідовність розгортання (після отримання схвалення)

1. **Авторизація Wrangler:**
   ```bash
   export PATH="$HOME/.local/node/bin:$PATH"
   cd /home/kostia/projects/rozklad/workers/api
   npx wrangler login
   ```
2. **Створення ізольованої Staging D1:**
   ```bash
   npx wrangler d1 create uni-schedule-staging-db
   ```
   Отриманий `database_id` підставляється виключно в секцію `[[env.staging.d1_databases]]` у `workers/api/wrangler.toml` (production/top-level конфіг не змінюється).
3. **Застосування міграцій на Staging D1 (`0001`–`0004`):**
   ```bash
   npx wrangler d1 migrations apply uni-schedule-staging-db --env staging --remote
   ```
   Порядок міграцій:
   - `0001_initial.sql` (базові таблиці користувачів, пристроїв, груп, розкладу, rate limits)
   - `0002_push_notifications.sql` (підписки, налаштування сповіщень, логи)
   - `0003_attendance_sync.sql` (`attendance_records`)
   - `0004_attendance_versioning.sql` (`server_version`, `server_updated_at`)
4. **Генерація та завантаження Staging-секретів (окремо від production):**
   ```bash
   npx web-push generate-vapid-keys
   npx wrangler secret put TOKEN_PEPPER --env staging
   npx wrangler secret put VAPID_PUBLIC_KEY --env staging
   npx wrangler secret put VAPID_PRIVATE_KEY --env staging
   npx wrangler secret put VAPID_SUBJECT --env staging
   ```
5. **Деплой Staging Worker:**
   ```bash
   npx wrangler deploy --env staging
   ```
   Після деплою перевірити `GET https://uni-schedule-staging.<subdomain>.workers.dev/api/health`.
6. **Налаштування Vercel Preview (Staging Frontend):**
   - У Vercel Dashboard -> Settings -> Environment Variables додати `VITE_API_BASE_URL` **тільки для Preview** (обмеживши гілкою `feat/final-hardening`, ніколи для Production) зі значенням URL staging Worker (`https://uni-schedule-staging.<subdomain>.workers.dev`).
   - Перевірити/оновити `ALLOWED_ORIGINS` у `[env.staging.vars]` точним origin Vercel Preview URL та передеплоїти `npx wrangler deploy --env staging`.
7. **Верифікація (Phase F):** виконати `docs/STAGING_SMOKE_TEST_CHECKLIST.md`, включно з тестуванням Web Push на фізичних пристроях (Android Chrome PWA / iOS Safari PWA).
