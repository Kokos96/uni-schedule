# Відомі проблеми та невирішені зауваження (Known Issues)

**Версія:** `v3.0.0` (`feat/final-hardening`, `9793ad55dcbfbaf8cfc530846aa9efe04963d0ba`)  
**Дата:** `2026-11-19`

---

## 1. Інфраструктурні та API-обмеження (Stage 8)

1. **Production середовище (`NOT READY`):**
   - Staging розгорнуто та верифіковано (`https://uni-schedule-lw02zf1wk-kokos96.vercel.app` + `https://uni-schedule-staging.lev68819.workers.dev`), однак Production D1 база, Production секрети та Production Worker/Vercel deploy ще не налаштовані.
   - **Наступний крок:** завершити фізичне тестування PWA Push на Android/iOS, налаштувати Production D1/секрети та закрити зауваження безпеки перед production-релізом.
2. **Параметр запиту `GET /api/schedule` (`group=` vs `groupId=`):**
   - Endpoint `GET /api/schedule` очікує query-параметр `group=` (наприклад, `?universityId=lnu&group=ФЕП-33с`), а не `groupId=`. Це зафіксовано в smoke-тестах і має враховуватися у всіх клієнтських/інтеграційних запитах.

---

## 2. Зауваження безпеки та надійності (Agent 2 / Agent 3 / Agent 5)

3. **`checkRateLimit` неатомарний (`SELECT` + `UPDATE`):**
   - Поточна реалізація rate limiter у D1 виконує окремі операції читання та оновлення лічильника, що допускає race condition при одночасних запитах.
   - **Статус:** не виправлено; занесено в `PRODUCTION_RELEASE_CHECKLIST.md`.
4. **Валідація `push_subscriptions` (`endpoint`, `p256dh`, `auth`):**
   - Відсутній hostname allowlist для `endpoint` push-підписки та перевірка довжини ключів `p256dh` і `auth`.
   - **Статус:** не виправлено; занесено в `PRODUCTION_RELEASE_CHECKLIST.md`.
5. **Production `TOKEN_PEPPER` empty-string fallback:**
   - Якщо `TOKEN_PEPPER` не заданий у середовищі, код використовує fallback на порожній рядок `""`, що послаблює захист хешів `syncToken` при помилці конфігурації.
   - **Статус:** у staging секрет заданий, але в коді для production потрібна fail-closed поведінка.
6. **`ALLOWED_ORIGINS` у production default містить `localhost`:**
   - У top-level `[vars]` (`workers/api/wrangler.toml`) зазначено `http://localhost:5173,http://127.0.0.1:4173,https://uni-schedule.vercel.app`. Перед production-релізом `localhost`-джерела мають бути видалені.

---

## 3. Масштабування та неперевірені сценарії

7. **Cloudflare Workers Free Tier ліміт `50` subrequests:**
   - При кількості активних push-підписників `>50` за один Cron-запуск без переходу на **Workers Paid** або **Cloudflare Queues** частина запитів може перевищити ліміт subrequests на Free Tier.
8. **Фізичні мобільні пристрої (Android Chrome / iOS Safari) та живий Cron (`NOT VERIFIED`):**
   - Поведінка Web Push і встановлення PWA підтверджені в локальному Chromium / Playwright, через live staging Push CRUD API та на живому Vercel Preview (`https://uni-schedule-lw02zf1wk-kokos96.vercel.app` -> `/sw.js`, `/manifest.json` -> `200 OK`), але реальна доставка push-сповіщень на фізичних Android та iOS пристроях і спрацювання живого Cron-тригера (`*/5 * * * *`) із бойовою підпискою на фізичному телефоні користувача ще не тестувалися.
