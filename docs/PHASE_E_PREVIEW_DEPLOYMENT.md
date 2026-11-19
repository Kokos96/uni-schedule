# Phase E — Staging & Vercel Preview Deployment

- **Staging Worker:** `https://uni-schedule-staging.lev68819.workers.dev`
  - **Version ID:** `e6f3cca9-72a3-4068-aa9a-97a7d0f780a9`
  - **Cron Trigger:** `*/5 * * * *`
  - **D1 Binding:** `uni-schedule-staging-db` (`be373ae1-65ad-4243-96bf-5a7d9cf07aa2`, migrations `0001`–`0005` applied)
- **Vercel Preview (non-production):** `https://uni-schedule-7akhw5030-kokos96.vercel.app`
  - **Inspect URL:** `https://vercel.com/kokos96/uni-schedule/3U9putL7xzipDuUMX2tJH9h7FvNA`
  - **Build env:** `VITE_API_BASE_URL=https://uni-schedule-staging.lev68819.workers.dev`
  - **Verified via `vercel curl`:** `/` -> `HTTP 200`, `/sw.js` -> `HTTP 200`, `/manifest.json` -> `HTTP 200`
- **Production untouched:** Neither production Cloudflare Worker/D1 nor production Vercel (`--prod`) was modified.
