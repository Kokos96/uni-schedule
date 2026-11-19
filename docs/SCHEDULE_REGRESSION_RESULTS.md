# Результати регресійного тестування розкладу та бекенду

**Дата фіксації:** 2026-11-19  
**Загальний статус:** `VERIFIED` (збірка, typecheck, 51/51 TypeScript тестів, локальні D1/API матриці та live staging) | `NOT VERIFIED` (фізичний Android/iOS Push; результати `verify_app.py` очікуються)

---

## 1. Збірка та статична перевірка (`VERIFIED`)

| Перевірка | Команда / Область | Результат | Деталі |
|---|---|---|---|
| TypeScript check | `workers/api`: `npm run typecheck` | **PASS** | 0 помилок |
| Production build | `npm run build` | **PASS** | `5.71s` |

---

## 2. TypeScript тести — 8 наборів (`51/51 PASS`, `VERIFIED`)

| Тестовий набір | Пройдено / Всього | Статус |
|---|---|---|
| `domain.test.ts` | 22 / 22 | **PASS** |
| `lnuParser.test.ts` | 8 / 8 | **PASS** |
| `attendanceSyncClient.test.ts` | 2 / 2 | **PASS** |
| `scheduleEngineOverhaul.test.ts` | 4 / 4 | **PASS** |
| `api.test.ts` | 8 / 8 | **PASS** |
| `push.test.ts` | 4 / 4 | **PASS** |
| `attendanceSync.test.ts` | 2 / 2 | **PASS** |
| `loadSimulation.test.ts` | 1 / 1 | **PASS** |
| **Разом** | **51 / 51** | **PASS** |

---

## 3. Локальні інтеграційні та D1/Cron тести (`VERIFIED`)

| Тест | Пройдено / Всього | Час | Ключові спостереження |
|---|---|---|---|
| `localApiMatrix.test.mjs` | **1 / 1 PASS** | `15.20s` | Повна API-матриця локального середовища |
| `localD1ConstraintsAndCron.test.mjs` | **2 / 2 PASS** | `5.13s` | D1 constraints + Cron benchmark: `processingMs: 58–104 ms`, `pushAvgRttMs: 3–23 ms` |

---

## 4. Live Staging перевірка (`VERIFIED`)

- **URL:** `https://uni-schedule-staging.lev68819.workers.dev`
- **Версія Worker:** `94633f04-f80f-4e06-9ae1-fbcae6afebd5`
- **База даних D1:** `uni-schedule-staging-db` (застосовано міграцію `0005_schedule_electives.sql`)
- **Перевірка LNU парсингу (`ФЕП-33с`):** `LIVE_LNU_OK: total=64, dvvs=13, tracked=18` — **PASS**
- **Перевірка синхронізації профілю (`/api/profile`):** `LIVE_PROFILE_SYNC_OK: selectedElectives & selectedTrack persisted` — **PASS**

---

## 5. Незавершені / Неверифіковані перевірки

| Перевірка | Статус | Примітка |
|---|---|---|
| `verify_app.py` (9 viewport E2E) | `PARTIALLY VERIFIED` / в процесі | На момент фіксації звіту `verify_app.py` (9 viewport E2E) виконується паралельно і ще не завершений |
| Фізичний Android/iOS Web Push | `NOT VERIFIED` | Потребує тестування на реальних мобільних пристроях із production-подібним HTTPS/VAPID |
