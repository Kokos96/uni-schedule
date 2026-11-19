# Архітектура системи Uni Schedule (v2.1 — Multi-University & Push)

## 1. Загальна схема взаємодії

```text
+-----------------------------------+        HTTPS / JSON        +------------------------------------+
|       Frontend PWA (Vercel)       | <========================> |   Cloudflare Worker (workers/api)  |
|-----------------------------------|   Bearer syncToken (Auth)  |------------------------------------|
| - React 18 + TypeScript + Vite    |                            | - CORS Allowlist & Rate Limiter    |
| - Graphite Glass Design System    |                            | - Auth & Device Management         |
| - University Adapter Registry     |                            | - LNU TS Parser (cp1251)           |
| - Offline-First Attendance Queue  |                            | - Shared Group Schedule Cache      |
| - Service Worker (Cache + Push)   |                            | - Cron Trigger (*/5 * * * *)       |
+-----------------------------------+                            | - Web Push (VAPID + aes128gcm)     |
                                                                 +-----------------+------------------+
                                                                                   |
                                                                                   v
                                                                 +------------------------------------+
                                                                 |      Cloudflare D1 (SQLite)        |
                                                                 |------------------------------------|
                                                                 | users, user_devices                |
                                                                 | student_profiles, universities     |
                                                                 | university_groups, schedule_entries|
                                                                 | push_subscriptions, preferences    |
                                                                 | notification_logs, attendance_recs |
                                                                 +------------------------------------+
```

---

## 2. Frontend-архітектура (`src/`)

- **Адаптери університетів (`src/integrations/universities/`):**
  - `types.ts` — спільний контракт `UniversityAdapter`, `NormalizedSchedule`, `ScheduleLesson`.
  - `registry.ts` — реєстр університетів (`lnu`, `other`).
  - `lnu/` — чистий TS `cp1251` encoder/decoder, HTML/JSON парсер `lnuParser.ts`, проксі-адаптер `lnuAdapter.ts`.
  - `manual/` — чесний fallback (`manual_only`) для непідключених університетів.
  - `normalizers/scheduleNormalizer.ts` — стабільний `buildStableLessonId()` (не залежить від викладача або аудиторії).
- **Стан та офлайн-синхронізація:**
  - `useScheduleSource.ts` — реактивне джерело розкладу з кешем у `localStorage` (`uni_schedule_cached_group_v1`) та fallback на вбудований `ФЕП-33с`.
  - `useAttendance.ts` + `src/services/attendanceSync.ts` — offline-first черга (`uni_schedule_attendance_queue_v1`) + `serverVersion`-захищений LWW.
  - `src/services/apiClient.ts` & `pushClient.ts` — реєстрація пристрою (`syncToken`) та Web Push підписка по явному кліку.
- **PWA (`public/sw.js`):**
  - Network-first для навігації, cache-first для `/assets/`, stale-while-revalidate для іконок/маніфеста.
  - Обробники `push` та `notificationclick`.

---

## 3. Backend-архітектура (`workers/api/`)

- **Міграції D1 (`workers/api/migrations/`):**
  - `0001_initial.sql` — користувачі, пристрої, профілі, університети, групи, спільний кеш розкладу, rate-limit.
  - `0002_push_notifications.sql` — push-підписки, персональні налаштування, `notification_logs` із `UNIQUE(dedup_key)`.
  - `0003_attendance_sync.sql` — `attendance_records` із `PRIMARY KEY (user_id, lesson_id, lesson_date)`.
  - `0004_attendance_versioning.sql` — `server_version` та `server_updated_at` для захисту LWW від збитого годинника клієнта.
- **Cron-планувальник (`src/push/scheduler.ts`):**
  - Інтервал `*/5 * * * *`, пакетна обробка підписок, обчислення локального часу через `Intl.DateTimeFormat` з підтримкою будь-яких IANA timezone та DST.
  - Точні вечірні та п'ятничні підсумки на базі `attendance_records` (невідмічені пари ніколи не рахуються як пропущені).
