# Uni Schedule v3.0.0 — Production Cloudflare Worker

- **Worker Name:** `uni-schedule-api`
- **Production URL:** `https://uni-schedule-api.lev68819.workers.dev`
- **Deployed Version ID:** `e0dc3f49-27be-4d82-8cbb-01e0bdbced28`
- **Cron Trigger:** `*/5 * * * *`
- **D1 Binding:** `env.DB -> uni-schedule-db` (`6f4410a0-5082-452a-9a5b-9e58b9cbfe3e`)
- **Environment Variables:** `REQUIRE_TOKEN_PEPPER = "true"`, `ALLOWED_ORIGINS = "https://uni-schedule-opal.vercel.app"`, `SCHEDULE_CACHE_TTL_SECONDS = "21600"`, `GROUPS_CACHE_TTL_SECONDS = "86400"`
- **Secrets Configured (names only):** `TOKEN_PEPPER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
