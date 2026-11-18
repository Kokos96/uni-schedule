# Чекліст готовності до Production (Production Readiness Checklist)

- [ ] **Git merge:** переглянути гілку `feat/final-hardening` та злити її в `main` після фінального рев'ю.
- [ ] **Cloudflare авторизація:** виконати `npx wrangler login` у своєму акаунті.
- [ ] **Створення production D1:** виконати `npx wrangler d1 create uni-schedule-db` і підставити реальний `database_id` у `workers/api/wrangler.toml`.
- [ ] **Міграції D1 (remote):** виконати `npx wrangler d1 migrations apply uni-schedule-db --remote`.
- [ ] **Секрети Worker:** згенерувати production VAPID-ключі (`npx web-push generate-vapid-keys`) та `TOKEN_PEPPER`, задати через `wrangler secret put`:
  - `TOKEN_PEPPER`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
- [ ] **CORS Allowlist:** перевірити `ALLOWED_ORIGINS` у `workers/api/wrangler.toml` (додати точний production-домен Vercel).
- [ ] **Деплой Worker:** виконати `npx wrangler deploy` у `workers/api/`.
- [ ] **Frontend (Vercel):** задати `VITE_API_BASE_URL` у змінних середовища Vercel та задеплоїти `main`.
- [ ] **Smoke-тест на реальному пристрої:** перевірити вибір групи ЛНУ, синхронізацію відвідуваності на 2 пристроях та отримання Web Push на iOS PWA (через «На початковий екран») і Android.
