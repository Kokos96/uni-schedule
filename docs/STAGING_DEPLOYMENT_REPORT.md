# Звіт про розгортання Staging (Staging Deployment Report)

**Дата:** `2026-11-19`  
**Середовище:** `staging` (`uni-schedule-staging`)  
**Гілка / Коміт:** `feat/final-hardening` (`9793ad55dcbfbaf8cfc530846aa9efe04963d0ba`)

---

## 1. Підсумок результатів

| Компонент | Статус | Деталі |
|---|---|---|
| Staging D1 Database | **VERIFIED** | `uni-schedule-staging-db`, ID: `be373ae1-65ad-4243-96bf-5a7d9cf07aa2`, регіон: `EEUR`. |
| Віддалені D1 міграції | **VERIFIED** | Міграції `0001`–`0004` застосовані (`migs=4`, `subs=0`). |
| Staging Worker секрети | **VERIFIED** | Налаштовано на `uni-schedule-staging`: `TOKEN_PEPPER`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (без збереження значень у документації). |
| Staging Worker Deploy | **VERIFIED** | Задеплоєно `uni-schedule-staging` -> `https://uni-schedule-staging.lev68819.workers.dev` (Version ID `bc458760-1cc6-42da-8966-3cab9dae27b5`, Cron `*/5 * * * *`, `workers_dev = true`, `ALLOWED_ORIGINS` містить `https://uni-schedule-lw02zf1wk-kokos96.vercel.app`). |
| Vercel Preview Env Config | **VERIFIED** | На проєкті `uni-schedule` (`prj_aRRsDLY3V8YvE47OVUzG2VmyTgXj`, team `team_bdYEa0NIecI7CRbVEmkbKLdq`) задано `VITE_API_BASE_URL=https://uni-schedule-staging.lev68819.workers.dev` (ID `0coUCA7nLK18kjeL`), строго для `preview`; Production не змінювався. |
| Frontend (Vercel Preview URL) | **VERIFIED** | Задеплоєно та перевірено: `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` (`dpl_4aZQz6iqMsxvvV1puVMCEHWKZr8G`, `readyState=READY`, `target=null` Preview). |

**Загальний статус середовища:** **`STAGING DEPLOYED & VERIFIED (DESKTOP/API)`** *(фізичний Android Chrome / iOS Safari PWA Push та доставка живого Cron на фізичні пристрої залишаються **NOT VERIFIED** до тестування на фізичному телефоні; Production залишається **NOT READY** до фізичного тесту Push та налаштування Production D1/секретів).*

---

## 2. Виконані кроки на Cloudflare

1. **База даних D1:**
   - Назва: `uni-schedule-staging-db`
   - `database_id`: `be373ae1-65ad-4243-96bf-5a7d9cf07aa2`
   - Локація: `EEUR`
   - `database_id` прописаний у `workers/api/wrangler.toml` у секції `[[env.staging.d1_databases]]`.
2. **Міграції схеми:**
   - Виконано `npx wrangler d1 migrations apply uni-schedule-staging-db --env staging --remote` для міграцій `0001`–`0004` (`migs=4`, `subs=0`).
3. **Секрети середовища `staging`:**
   - Налаштовано на Worker `uni-schedule-staging` (значення в документації не зберігаються):
     - `TOKEN_PEPPER`
     - `VAPID_PUBLIC_KEY`
     - `VAPID_PRIVATE_KEY`
     - `VAPID_SUBJECT`
4. **Публікація Cloudflare Worker:**
   - Worker `uni-schedule-staging` опубліковано та повторно задеплоєно на `https://uni-schedule-staging.lev68819.workers.dev` із додаванням `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` до `[env.staging.vars].ALLOWED_ORIGINS`.
   - Актуальний Version ID: `bc458760-1cc6-42da-8966-3cab9dae27b5`.
   - Конфігурація: `workers_dev = true`, Cron-тригер `*/5 * * * *`.

---

## 3. Налаштування та деплой Vercel Preview

- **Проєкт:** `uni-schedule` (`prj_aRRsDLY3V8YvE47OVUzG2VmyTgXj`), команда `team_bdYEa0NIecI7CRbVEmkbKLdq`.
- **Змінна оточення:** `VITE_API_BASE_URL=https://uni-schedule-staging.lev68819.workers.dev` (ID `0coUCA7nLK18kjeL`), обмежена виключно середовищем **`preview`**.
- **Preview URL:** `https://uni-schedule-lw02zf1wk-kokos96.vercel.app`
- **Deployment ID:** `dpl_4aZQz6iqMsxvvV1puVMCEHWKZr8G` (`readyState=READY`, `target=null` Preview)
- **Inspect URL:** `https://vercel.com/kokos96/uni-schedule/4aZQz6iqMsxvvV1puVMCEHWKZr8G`
- **Production:** без змін (untouched).

---

## 4. Наступні кроки (Фізичне тестування та підготовка до Production)

1. **Фізична перевірка PWA / Web Push (`NOT VERIFIED`):** відкрити `https://uni-schedule-lw02zf1wk-kokos96.vercel.app` на фізичному телефоні (Android Chrome та iOS Safari), встановити PWA, оформити підписку та перевірити реальну доставку push-сповіщень і спрацювання живого Cron (`*/5 * * * *`).
2. **Підготовка до Production (`NOT READY`):** після успішного фізичного тесту Push створити/налаштувати Production D1, Production секрети, закрити зауваження безпеки та виконати production-деплой.

---

## 5. Інструкція швидкого відкату (Rollback)

- **Вимкнути Staging Cron без видалення Worker:**
  У `workers/api/wrangler.toml` в `[env.staging.triggers]` задати `crons = []` і виконати `npx wrangler deploy --env staging`.
- **Повністю видалити Staging Worker:**
  ```bash
  npx wrangler delete --name uni-schedule-staging --env staging
  ```
- **Очистити тестові дані у Staging D1 (без впливу на production):**
  ```bash
  npx wrangler d1 execute uni-schedule-staging-db --env staging --remote --command "DELETE FROM notification_logs; DELETE FROM push_subscriptions;"
  ```
- **Відкотити Frontend Preview:**
  Видалити `VITE_API_BASE_URL` (ID `0coUCA7nLK18kjeL`) у налаштуваннях Vercel Preview або виконати rollback до попереднього Preview deployment у Vercel Dashboard.
