# Release Notes — Uni Schedule `v3.0.0`

**Версія:** `v3.0.0`  
**Гілка підготовки:** `feat/final-hardening` (`9793ad55dcbfbaf8cfc530846aa9efe04963d0ba`)  
**Статус:** Локально верифіковано; віддалений staging заблокований на етапі `workers.dev` onboarding та Vercel Preview auth (див. `docs/PROJECT_READINESS_REPORT.md`).

---

## Основні зміни у `v3.0.0`

### 1. Інтеграція університетів (ЛНУ + ручний fallback)
- Додано інтеграцію з розкладом ЛНУ ім. Івана Франка (`dekanat.lnu.edu.ua`): завантаження списку груп, парсинг розкладу та кешування у Cloudflare D1 з fallback-механізмом.
- Реалізовано реєстр університетів та режим ручного введення (`manual_only`) для груп і розкладів без зовнішнього API.

### 2. Бекенд на Cloudflare Workers + D1
- Реалізовано REST API на Cloudflare Workers (`workers/api`) з базою даних Cloudflare D1 (міграції `0001`–`0004` з `FOREIGN KEY`, `UNIQUE`, `CHECK`, `NOT NULL`).
- Додано ізольовану staging-конфігурацію `[env.staging]` (`uni-schedule-staging` + `uni-schedule-staging-db`).

### 3. Web Push та 5 Cron-сценаріїв сповіщень
- Реалізовано Web Push (VAPID + `AES-128-GCM` шифрування payload) з управлінням підписками через `/api/push/*`.
- Налаштовано Cron Trigger (`*/5 * * * *`) із підтримкою 5 сценаріїв сповіщень, обліком переходу на літній/зимовий час (DST) та атомарною дедуплікацією через `notification_logs`.

### 4. Крос-пристроєвий Offline-first Attendance Sync
- Додано синхронізацію відвідуваності та профілю між пристроями за допомогою 256-бітного `syncToken` (`ust_...`) та прив’язки пристроїв.
- Реалізовано локальну офлайн-чергу змін (`uni_schedule_attendance_queue_v1`), оптимістичне версіонування (`baseVersion`) та коректну обробку конфліктів (`stale` / `unmarked`).

### 5. Graphite Glass PWA
- Збережено та розвинуто дизайн-систему **Graphite Glass** (Graphite Dark / Warm Parchment Light), `LivePairHero` з відліком до кінця/початку пари, нотатки до пар і дедлайни, довідник викладачів/аудиторій, калькулятор цілі відвідуваності, тижневі тренди та JSON v2 експорт/імпорт.
- Оновлено Service Worker (`public/sw.js`) та офлайн-сторінку (`/offline.html`) для надійної роботи без мережі.

### 6. Stage 7 / Stage 8 Hardening та якість
- Впроваджено CORS allowlist (без wildcard `*`), хешування `syncToken` з `TOKEN_PEPPER` (SHA-256), D1 rate limiting (`429` з `Retry-After`) та глобальну обробку помилок без витоку stack trace / SQL.
- Проведено повну локальну регресію: `47/47` TypeScript-тестів, `localApiMatrix` (`1/1`), `localD1ConstraintsAndCron` (`2/2`), Playwright E2E по 9 viewport (`verify_app.py`) та 2-пристроєвий offline sync (`verify_attendance_sync.py`), `npm run build` і `wrangler deploy --dry-run`.
