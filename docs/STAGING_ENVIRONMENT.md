# Ізольована архітектура Staging-середовища (Uni Schedule)

## Принципи ізоляції
- Staging **ніколи** не підключається до production D1, не використовує production VAPID-ключі та не змінює `main`.
- Топ-рівнева конфігурація `workers/api/wrangler.toml` залишається недоторканою; staging описується в окремому блоці `[env.staging]`.

## Мапа ресурсів та змінних

| Компонент | Назва / Значення для Staging | Примітка |
|---|---|---|
| **Worker** | `uni-schedule-staging` | Окремий Cloudflare Worker (`[env.staging]` у `workers/api/wrangler.toml`, `workers_dev = true`) |
| **D1 Database** | `uni-schedule-staging-db` | Binding `DB`, окремий placeholder `REPLACE_WITH_STAGING_D1_DATABASE_ID` |
| **Frontend Hosting** | Vercel Preview Deployment | Гілка `feat/final-hardening` (не `main`) |
| **Frontend Env Var** | `VITE_API_BASE_URL` (тільки **Preview**, branch: `feat/final-hardening`) | Вказує на `https://uni-schedule-staging.<subdomain>.workers.dev` |
| **Worker Var** | `ALLOWED_ORIGINS` (`[env.staging.vars]`) | `http://localhost:5173,http://127.0.0.1:4173,https://uni-schedule-git-feat-final-hardening.vercel.app` (без wildcard `*`; перед Phase E замінити/додати точний Vercel Preview URL якщо відрізняється) |
| **Worker Var** | `SCHEDULE_CACHE_TTL_SECONDS = "21600"` | 6 годин кешу розкладу |
| **Worker Var** | `GROUPS_CACHE_TTL_SECONDS = "86400"` | 24 години кешу груп |
| **Cron Trigger** | `[env.staging.triggers] crons = ["*/5 * * * *"]` | Може бути вимкнений окремо (`crons = []`) |

## Секрети Staging (`wrangler secret put --env staging`)
Значення задаються виключно через Wrangler CLI (у Git не комітяться):
- `TOKEN_PEPPER` — окремий випадковий 32+ байтний hex-рядок для HMAC/SHA-256 хешування `syncToken`.
- `VAPID_PUBLIC_KEY` — окремий публічний P-256 ключ для staging Web Push.
- `VAPID_PRIVATE_KEY` — окремий приватний ключ для staging Web Push.
- `VAPID_SUBJECT` — `mailto:<staging-admin-email>`.

## Безпека та спостережуваність (Audit Phase A)
- `workers/api/src/security.ts`: суворий CORS allowlist (`isOriginAllowed`), `X-Content-Type-Options: nosniff`, `syncToken` зберігається в D1 лише як SHA-256 хеш.
- `workers/api/src/index.ts`: загальний `try/catch` повертає `500 INTERNAL_ERROR` без витоку SQL чи stack trace; rate limiting (`20/хв` write/auth, `60/хв` read) ізольований у staging D1; `GET /api/health` доступний без авторизації.
- `vercel.json`: `/sw.js` роздається з `Cache-Control: no-cache, no-store, must-revalidate`, статичні чанки `/assets/*` — з `immutable`.
