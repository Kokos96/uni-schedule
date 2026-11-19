# План відкату Staging (Rollback Plan)

Усі дії нижче стосуються **виключно** staging-середовища й не впливають на production.

## 1. Швидке вимкнення Staging Cron
Якщо staging Cron надсилає помилкові або зайві сповіщення:
1. У `workers/api/wrangler.toml` у секції `[env.staging.triggers]` встановити `crons = []`.
2. Виконати повторний деплой:
   ```bash
   npx wrangler deploy --env staging
   ```

## 2. Повне вимкнення Staging Worker
Якщо staging Worker створює небажане навантаження або помилки:
```bash
npx wrangler delete --name uni-schedule-staging --env staging
```
*(Альтернативно — тимчасово видалити/очистити `ALLOWED_ORIGINS` або секрети через `wrangler secret delete <KEY> --env staging`.)*

## 3. Відкат Staging Frontend (Vercel Preview)
1. У Vercel Dashboard -> Deployments знайти попередній стабільний Preview deployment.
2. За потреби видалити/змінити Preview-змінну `VITE_API_BASE_URL` (поверне фронтенд у безпечний local-only режим без серверного API) або виконати `git revert` на гілці `feat/final-hardening`.

## 4. Ізоляція та відновлення Staging D1
- Staging D1 (`uni-schedule-staging-db`) повністю ізольована від production.
- У разі пошкодження тестових даних у staging:
  - очистити тестові рядки через `npx wrangler d1 execute uni-schedule-staging-db --env staging --remote --command "DELETE FROM notification_logs;"` (або перестворити виключно staging БД `uni-schedule-staging-db` і повторно застосувати міграції `0001`–`0004`).
- Для відновлення попередньої версії конфігурації staging повернути попередній коміт у `feat/final-hardening` та виконати `npx wrangler deploy --env staging`.
