# Тестування (Testing Guide)

## 1. Автоматизовані тести

Усі сьюти запускаються без зовнішнього доступу до інтернету та без реального деплою:

1. **TypeScript + Production Build:**
   ```bash
   npm run build
   ```
2. **Unit-тести домену, URL та клієнтської синхронізації:**
   ```bash
   ./node_modules/.bin/esbuild tests/unit/domain.test.ts --bundle --platform=node --format=esm --outfile=/tmp/domain.test.mjs && node --test /tmp/domain.test.mjs
   ./node_modules/.bin/esbuild tests/unit/lnuParser.test.ts --bundle --platform=node --format=esm --outfile=/tmp/lnuParser.test.mjs && node --test /tmp/lnuParser.test.mjs
   ./node_modules/.bin/esbuild tests/unit/attendanceSyncClient.test.ts --bundle --platform=node --format=esm --outfile=/tmp/syncClient.test.mjs && node --test /tmp/syncClient.test.mjs
   ```
3. **Backend API, Web Push/Cron, Attendance Sync та Load Simulation:**
   ```bash
   ./node_modules/.bin/esbuild workers/api/tests/api.test.ts --bundle --platform=node --format=esm --outfile=/tmp/api.test.mjs && node --test /tmp/api.test.mjs
   ./node_modules/.bin/esbuild workers/api/tests/push.test.ts --bundle --platform=node --format=esm --outfile=/tmp/push.test.mjs && node --test /tmp/push.test.mjs
   ./node_modules/.bin/esbuild workers/api/tests/attendanceSync.test.ts --bundle --platform=node --format=esm --outfile=/tmp/attSync.test.mjs && node --test /tmp/attSync.test.mjs
   ./node_modules/.bin/esbuild workers/api/tests/loadSimulation.test.ts --bundle --platform=node --format=esm --outfile=/tmp/loadSim.test.mjs && node --test /tmp/loadSim.test.mjs
   ```
4. **Playwright E2E (9 viewport від `320×844` до `1920×900`):**
   ```bash
   python tests/e2e/verify_app.py
   ```

---

## 2. Ручне тестування з локальним Wrangler D1
1. Виконати `npx wrangler d1 migrations apply uni-schedule-db --local` у `workers/api/`.
2. Запустити `npx wrangler dev --test-scheduled`.
3. Тригернути Cron вручну: `curl "http://127.0.0.1:8787/__scheduled?cron=*/5+*+*+*+*"`.
4. Деталі перевірки синхронізації на двох пристроях див. у [ATTENDANCE_SYNC.md](file:////wsl.localhost/Ubuntu/home/kostia/projects/rozklad/docs/ATTENDANCE_SYNC.md).
