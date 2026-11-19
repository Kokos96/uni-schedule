# Модель загроз та безпека (Security Hardening)

## 1. Автентифікація пристроїв та `syncToken`
- Кожен пристрій отримує криптографічно випадковий 256-бітний `syncToken` (`crypto.getRandomValues`).
- У таблиці `user_devices` зберігається **лише** `SHA-256(TOKEN_PEPPER + ':' + syncToken)` — сирий токен ніколи не записується в БД.
- Підтримується:
  - Прив'язка кількох пристроїв (`POST /api/devices/link`).
  - Миттєвий перевипуск токена (`POST /api/devices/rotate`), що одразу робить старий токен невалідним (`401`).
  - Відкликання пристрою (`DELETE /api/devices/:deviceId`), що блокує подальші запити та Cron push-сповіщення для цього пристрою.

## 2. Захист від IDOR та ізоляція користувачів
- Ідентифікатор `userId` береться **виключно** з перевіреного `Authorization: Bearer <syncToken>`, ніколи з query/body параметрів.
- Усі запити на читання, оновлення та видалення пристроїв, профілю, push-підписок і відвідуваності містять `WHERE user_id = ?` (`auth.userId`).

## 3. Захист LWW від збитого годинника клієнта (`0004_attendance_versioning.sql`)
- Клієнтський `updatedAt` обмежується (`clampClientTimestamp`): будь-який timestamp у майбутньому обрізається до `serverNow + 5 хвилин`.
- Кожна прийнята зміна інкрементує монотонну серверну версію `server_version` та фіксує `server_updated_at`.
- Підтримується оптимістичне оновлення через `baseVersion`: пристрій із коректним `baseVersion` ніколи не буде заблокований пристроєм із неправильно виставленим годинником.

## 4. Мережа, CORS, SQL Injection та Rate Limiting
- **CORS Allowlist:** перевіряється заголовок `Origin` проти `ALLOWED_ORIGINS` (недозволені origin отримують `403`, wildcard `*` не використовується).
- **SQL Injection:** усі запити до D1 використовують параметризовані `.prepare(...).bind(...)`.
- **Rate Limiting:** фіксоване 60-секундне вікно в D1 (`20` запитів/хв на запис/auth/force-sync, `60` запитів/хв на читання) з поверненням `429` і `Retry-After`.
- **Помилки:** клієнту ніколи не повертаються stack trace або сирі SQL-помилки.
- **Секрети:** `VAPID_PRIVATE_KEY` і `TOKEN_PEPPER` зберігаються лише в Cloudflare Secrets / `.dev.vars` (у Git лише `.dev.vars.example` та `.env.example`).
