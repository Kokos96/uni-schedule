# Покрокова інструкція розгортання (Deployment Guide)

## 1. Передумови
- Node.js >= 18.19
- Акаунт Cloudflare (Workers & D1) та Vercel (Frontend)
- Встановлені пакети у корені (`npm install`) та в `workers/api` (`cd workers/api && npm install`)

---

## 2. Генерація VAPID-ключів та секретів

1. Згенеруйте VAPID-пару:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Згенеруйте випадковий `TOKEN_PEPPER`:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

---

## 3. Локальний запуск (без акаунта Cloudflare)

1. Створіть `workers/api/.dev.vars` на основі `workers/api/.dev.vars.example`:
   ```env
   TOKEN_PEPPER=<ваш_випадковий_hex>
   ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:4173
   VAPID_PUBLIC_KEY=<ваш_public_key>
   VAPID_PRIVATE_KEY=<ваш_private_key>
   VAPID_SUBJECT=mailto:your@email.com
   ```
2. Застосуйте всі 4 D1-міграції локально:
   ```bash
   cd workers/api
   npm install
   npx wrangler d1 migrations apply uni-schedule-db --local
   ```
3. Запустіть Worker із тестуванням Cron:
   ```bash
   npx wrangler dev --test-scheduled
   ```
4. У корені проєкту створіть `.env.local` із `.env.example`:
   ```env
   VITE_API_BASE_URL=http://127.0.0.1:8787
   ```
5. Запустіть фронтенд:
   ```bash
   npm run dev
   ```

---

## 4. Production-розгортання Cloudflare Worker + D1

1. Авторизуйтеся у Wrangler:
   ```bash
   npx wrangler login
   ```
2. Створіть D1-базу:
   ```bash
   cd workers/api
   npx wrangler d1 create uni-schedule-db
   ```
3. Скопіюйте `database_id` у `workers/api/wrangler.toml` та оновіть `ALLOWED_ORIGINS` на ваш домен Vercel.
4. Застосуйте міграції на віддаленій базі:
   ```bash
   npx wrangler d1 migrations apply uni-schedule-db --remote
   ```
5. Задайте секрети (ніколи не комітьте їх у Git!):
   ```bash
   npx wrangler secret put TOKEN_PEPPER
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   npx wrangler secret put VAPID_SUBJECT
   ```
6. Задеплойте Worker:
   ```bash
   npx wrangler deploy
   ```

---

## 5. Підключення Frontend на Vercel

1. У налаштуваннях проєкту Vercel додайте змінну середовища:
   - `VITE_API_BASE_URL` = `https://uni-schedule-api.<ваш-subdomain>.workers.dev`
2. Перезберіть / задеплойте фронтенд на Vercel (`npm run build`).
