# Web Push Notifications та Cron-планувальник — Етап №4

## 1. Архітектура

1. **VAPID + Web Crypto API ([webPush.ts](file:////wsl.localhost/Ubuntu/home/kostia/projects/rozklad/workers/api/src/push/webPush.ts)):**
   - Повністю без Node.js залежностей (`crypto.subtle` ECDSA P-256 для VAPID JWT + ECDH P-256 + HKDF-SHA-256 + AES-128-GCM згідно з RFC 8291 `aes128gcm` і RFC 8292).
   - Повторні спроби на тимчасові помилки (`429`, `5xx`, мережа) через `sendWebPushWithRetry()`.
   - Автоматичне видалення прострочених підписок при `404` / `410` від Push Service.
2. **Cron-планувальник ([scheduler.ts](file:////wsl.localhost/Ubuntu/home/kostia/projects/rozklad/workers/api/src/push/scheduler.ts)):**
   - Запускається кожні 5 хвилин (`*/5 * * * *` у `wrangler.toml`).
   - Обчислює локальний час користувача через `Intl.DateTimeFormat(..., { timeZone })`, коректно обробляючи `Europe/Kyiv` та перехід на літній/зимовий час (DST).
   - Перевіряє 5 сценаріїв: ранковий дайджест (`08:00`), до початку пари (`5/10/15/30` хв), до завершення пари (`5/10/15` хв), вечірній підсумок (`20:00`), п'ятничний підсумок (налаштовуваний час, за замовчуванням `18:00`).
   - Атомарна дедуплікація через `UNIQUE(dedup_key)` у `notification_logs` (`INSERT OR IGNORE`): повторний запуск Cron у межах 5-хвилинного вікна не дублює сповіщення.
   - Вечірні та п'ятничні підсумки на Етапі №4 чесно показують лише кількість пар за розкладом (повна статистика відвідуваності буде підключена на Етапі №5, невідмічені пари ніколи не рахуються як пропущені).
3. **Service Worker ([sw.js](file:////wsl.localhost/Ubuntu/home/kostia/projects/rozklad/public/sw.js)) та UI ([NotificationsSettingsSection.tsx](file:////wsl.localhost/Ubuntu/home/kostia/projects/rozklad/src/components/settings/NotificationsSettingsSection.tsx)):**
   - Обробники `push` і `notificationclick` у SW без порушення офлайн-кешу.
   - Запит дозволу `Notification.requestPermission()` виконується **виключно** після натискання кнопки «Увімкнути сповіщення».
   - Окрема покрокова інструкція для iOS Safari (додавання PWA на екран «Додому» перед підпискою).

---

## 2. Локальне тестування через Wrangler

1. Згенерувати VAPID-ключі:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Заповнити `workers/api/.dev.vars` на основі `.dev.vars.example`:
   - `TOKEN_PEPPER`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT=mailto:your@email.com`
3. Застосувати обидві D1-міграції локально:
   ```bash
   cd workers/api
   npx wrangler d1 migrations apply uni-schedule-db --local
   ```
4. Запустити Worker із підтримкою тестування Cron:
   ```bash
   npx wrangler dev --test-scheduled
   ```
5. Тригернути Cron вручну:
   ```bash
   curl "http://127.0.0.1:8787/__scheduled?cron=*/5+*+*+*+*"
   ```
