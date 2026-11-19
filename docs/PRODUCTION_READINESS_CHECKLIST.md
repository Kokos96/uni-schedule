# Чекліст готовності до Staging та Production (Readiness Checklist)

## Статус локальної верифікації (Stage 7.1)
- **Висновок:** **READY FOR STAGING** (усі локальні інтеграційні, D1 constraints, 5 Cron-сценаріїв, наскрізний 2-пристроєвий Offline Attendance Sync, API Matrix та 9-viewport E2E тести пройшли успішно).

## Кроки перед виходом на Staging / Production
- [ ] **Git merge:** переглянути гілку `feat/final-hardening` та злити її в `main` після фінального рев'ю.
- [ ] **Cloudflare авторизація:** виконати `npx wrangler login` у своєму акаунті.
- [ ] **Створення D1 (staging/production):** виконати `npx wrangler d1 create uni-schedule-db` і підставити реальний `database_id` у `workers/api/wrangler.toml`.
- [ ] **Міграції D1 (remote):** виконати `npx wrangler d1 migrations apply uni-schedule-db --remote`.
- [ ] **Секрети Worker:** згенерувати VAPID-ключі (`npx web-push generate-vapid-keys`) та `TOKEN_PEPPER`, задати через `wrangler secret put`:
  - `TOKEN_PEPPER`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
- [ ] **CORS Allowlist:** перевірити `ALLOWED_ORIGINS` у `workers/api/wrangler.toml` (додати точні домени staging/production Vercel).
- [ ] **Деплой Worker:** виконати `npx wrangler deploy` у `workers/api/`.
- [ ] **Frontend (Vercel):** задати `VITE_API_BASE_URL` у змінних середовища Vercel та задеплоїти.
- [ ] **Smoke-тест на реальному пристрої (staging):** перевірити вибір групи ЛНУ, синхронізацію відвідуваності на 2 фізичних пристроях та отримання Web Push на iOS PWA (через «На початковий екран») і Android.
