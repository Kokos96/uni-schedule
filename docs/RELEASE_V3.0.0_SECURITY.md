# Uni Schedule v3.0.0 — Security Verification

- **Secrets:** Fresh production-independent `TOKEN_PEPPER` and ECDSA P-256 `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` configured via `wrangler secret put`; zero secrets committed to Git or printed in logs.
- **`TOKEN_PEPPER` Fail-Closed:** `REQUIRE_TOKEN_PEPPER = "true"` active in production.
- **CORS Isolation:** `https://uni-schedule-opal.vercel.app` -> `200`; `https://evil.example` -> `403`; staging origin -> `403`.
- **Auth & Push Guards:** Unauthenticated `/api/profile` -> `401`; Push SSRF `http://127.0.0.1/push` -> `400`.
