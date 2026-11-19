# Звіт про готовність продукту (Product Readiness Report)

**Статус:** `STAGING DEPLOYED & VERIFIED (BACKEND/DESKTOP/ENGINE)` | **`NOT READY FOR PRODUCTION`**

---

## 1. Підсумок за підсистемами

| Підсистема | Статус | Підтвердження |
|---|---|---|
| **Рушій розкладу (парсер, фільтрація ДВВС/треків/підгруп, `StatsView`)** | `VERIFIED` | `51/51` TS-тестів, `LIVE_LNU_OK: total=64, dvvs=13, tracked=18` на staging |
| **Синхронізація профілю та D1 (`0005_schedule_electives.sql`)** | `VERIFIED` | `LIVE_PROFILE_SYNC_OK: selectedElectives & selectedTrack persisted` на `uni-schedule-staging-db` |
| **Push-планувальник та латентність (бекенд + SW)** | `VERIFIED` (локально/юніт) | `push.test.ts` 4/4, `localD1ConstraintsAndCron.test.mjs` 2/2 (`processingMs: 58–104 ms`, `pushAvgRttMs: 3–23 ms`) |
| **Збірка та інтеграційна матриця API** | `VERIFIED` | `typecheck` PASS (0 помилок), `build` PASS (`5.71s`), `localApiMatrix.test.mjs` 1/1 (`15.20s`) |
| **E2E UI (9 viewport у `verify_app.py`)** | `PARTIALLY VERIFIED` | Виконується паралельно; фінальний прогін ще не зафіксовано на момент звіту |
| **Реальна доставка Push на Android / iOS** | `NOT VERIFIED` | Не тестувалося на фізичних смартфонах |
| **Frontend Preview (Vercel) на актуальній гілці `feat/final-hardening`** | `NOT VERIFIED` | Потрібна перезбірка Vercel Preview з останніми змінами `feat/final-hardening` |
| **Production інфраструктура (D1 + секрети)** | `BLOCKED` / `NOT VERIFIED` | Production D1-база, міграції та production-секрети ще не налаштовані |

---

## 2. Чому продукт ще `NOT READY FOR PRODUCTION`

Незважаючи на успішний деплой та верифікацію рушія розкладу і бекенду на staging (`https://uni-schedule-staging.lev68819.workers.dev`, версія `94633f04-f80f-4e06-9ae1-fbcae6afebd5`), перехід у Production заблокований трьома обов'язковими кроками:

1. **Фізичне тестування Push на Android та iOS (`NOT VERIFIED`):**
   - Необхідно перевірити отримання сповіщень, коректність `Urgency: high` / `TTL: 900`, deep links (`/?date=...`, `/?tab=stats`) та `actions` у `public/sw.js` на реальних мобільних пристроях.
2. **Оновлення Vercel Preview (`NOT VERIFIED`):**
   - Потрібно перезібрати Vercel Preview із фінальним комітом гілки `feat/final-hardening` та переконатися у відсутності розбіжностей між фронтендом і staging API.
3. **Налаштування Production D1 та секретів (`BLOCKED`):**
   - Потрібно створити/підготувати production D1-базу, застосувати всі міграції включно з `0005_schedule_electives.sql` і налаштувати production-секрети (зокрема VAPID та ключі доступу).

---

## 3. Умови переходу до Production-релізу

Продукт може бути переведений у статус `READY FOR PRODUCTION` лише після виконання всіх трьох пунктів вище та фіксації зеленого результату `verify_app.py` (9 viewport E2E).
