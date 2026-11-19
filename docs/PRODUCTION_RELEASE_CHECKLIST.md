# Чекліст випуску в Production (Production Release Checklist)

**Проєкт:** Uni Schedule (`v3.0.0`)  
**Дата:** `2026-11-19`

> Цей чекліст є обов’язковим перед злиттям `feat/final-hardening` у `main` та публікацією production-версії.

---

## 1. Безпека коду та конфігурації (Обов’язкові виправлення до Production)

- [ ] **`TOKEN_PEPPER` fail-closed:** прибрати fallback на порожній рядок `""` у production; якщо `TOKEN_PEPPER` не заданий, Worker має повертати контрольовану помилку конфігурації (`500`) замість слабкого хешування.
- [ ] **`ALLOWED_ORIGINS` без `localhost`:** прибрати `http://localhost:5173` та `http://127.0.0.1:4173` із top-level `[vars].ALLOWED_ORIGINS` у `workers/api/wrangler.toml`, залишивши лише точні production-домени Vercel / власний домен.
- [ ] **Атомарний `checkRateLimit`:** замінити пару `SELECT` + `UPDATE` на атомарний запит у D1 (наприклад, `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`), щоб виключити race condition під паралельним навантаженням.
- [ ] **Валідація `push_subscriptions`:** додати перевірку hostname allowlist для `endpoint` (дозволені push-провайдери браузерів, HTTPS) та перевірку довжини/формату ключів `p256dh` і `auth`.

---

## 2. Інфраструктура Cloudflare Production

- [ ] **Завершити `workers.dev` onboarding** (якщо використовується `workers.dev`) або налаштувати production Custom Domain у Cloudflare.
- [ ] **Створити production D1 базу даних:**
  ```bash
  npx wrangler d1 create uni-schedule-db
  ```
  Підставити отриманий `database_id` замість `REPLACE_WITH_YOUR_D1_DATABASE_ID` у top-level `[[d1_databases]]` (`workers/api/wrangler.toml`).
- [ ] **Застосувати міграції `0001`–`0004` на production D1:**
  ```bash
  npx wrangler d1 migrations apply uni-schedule-db --remote
  ```
- [ ] **Згенерувати та задати окремі production-секрети** (ніколи не використовувати staging-ключі):
  ```bash
  npx web-push generate-vapid-keys
  npx wrangler secret put TOKEN_PEPPER
  npx wrangler secret put VAPID_PUBLIC_KEY
  npx wrangler secret put VAPID_PRIVATE_KEY
  npx wrangler secret put VAPID_SUBJECT
  ```
- [ ] **Масштабування Push (>50 підписників):**
  На **Workers Free Tier** діє ліміт `50` subrequests за одне виконання. Якщо кількість активних push-підписників у піковий Cron-слот перевищить `50`, необхідно перейти на **Workers Paid** або винести розсилку у **Cloudflare Queues** (batching).

---

## 3. Staging Verification (Перед Production)

- [ ] **Перевірка LNU (`dekanat.lnu.edu.ua`) з Cloudflare Edge IP:** підтвердити на staging, що Cloudflare Worker успішно отримує розклад і список груп без блокувань/таймаутів з боку сервера ЛНУ.
- [ ] **Фізичний smoke-тест Android Chrome PWA:**
  - встановлення PWA;
  - підписка на Web Push і отримання реального сповіщення від Cron;
  - офлайн-відмітка відвідуваності та синхронізація між 2 пристроями.
- [ ] **Фізичний smoke-тест iOS Safari PWA (iOS 16.4+):**
  - додавання на екран «Додому» («На початковий екран»);
  - дозвіл на сповіщення та отримання Web Push;
  - перевірка роботи інтерфейсу без горизонтального скролу та коректних safe-area відступів.

---

## 4. Деплой Production та Git Release

- [ ] **Злити перевірену гілку в `main`** після фінального code review та проходження локальної регресії.
- [ ] **Задеплоїти production Worker:**
  ```bash
  cd /home/kostia/projects/rozklad/workers/api
  npx wrangler deploy
  ```
- [ ] **Налаштувати Production Frontend у Vercel:**
  - задати `VITE_API_BASE_URL` для Production-середовища;
  - виконати production-деплой та перевірити `/api/health` і CORS з production-домену.

---

## 5. План швидкого відкату Production (Rollback)

1. **Екстрене вимкнення Cron-розсилки:** у `[triggers]` (`workers/api/wrangler.toml`) задати `crons = []` і виконати `npx wrangler deploy`.
2. **Відкат Worker:** у Cloudflare Dashboard -> Workers & Pages -> `uni-schedule-api` -> Deployments виконати rollback на попередню стабільну версію (або `wrangler rollback`).
3. **Відкат Frontend:** у Vercel Dashboard -> Deployments виконати Instant Rollback до попереднього стабільного production deployment (або тимчасово прибрати `VITE_API_BASE_URL`, щоб перевести клієнт у безпечний local-only режим).
4. **База даних D1:** не виконувати деструктивних міграцій без попереднього експорту (`npx wrangler d1 export uni-schedule-db --remote --output=backup.sql`).
