# Phase E — Security Audit

## Confirmed Hardening Applied
1. **Push Subscription SSRF & Key Validation (`workers/api/src/routes/push.ts`):**
   - Added `isSafePushEndpointUrl` rejecting non-HTTPS URLs, localhost/loopback, private IPv4/IPv6 ranges, and non-standard ports.
   - Added strict `base64UrlToBytes` length checks requiring 65-byte `p256dh` and 16-byte `auth`.
   - Enforced `409 CONFLICT` when registering a push endpoint already bound to another user.
   - Verified on live staging (`POST /api/push/subscriptions` with `http://127.0.0.1/push` -> `400`) and in `workers/api/tests/api.test.ts`.
2. **Fail-Closed `TOKEN_PEPPER` (`workers/api/src/security.ts`, `wrangler.toml`):**
   - Added `resolveTokenPepper(env)` requiring `TOKEN_PEPPER` when `REQUIRE_TOKEN_PEPPER = "true"` (`[env.staging.vars]`), verified in `api.test.ts` (returns HTTP 500 when missing).
3. **CORS Isolation:**
   - Updated `[env.staging.vars].ALLOWED_ORIGINS` to include `https://uni-schedule-7akhw5030-kokos96.vercel.app`.
   - Verified `Origin: https://uni-schedule-7akhw5030-kokos96.vercel.app` -> HTTP 200; `Origin: https://evil.example` -> HTTP 403.
