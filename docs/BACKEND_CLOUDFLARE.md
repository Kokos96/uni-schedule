# Backend та D1-база даних (`workers/api/`) — Етап №3

## 1. Архітектура бази даних (Cloudflare D1 / SQLite)

Міграція: [0001_initial.sql](file:////wsl.localhost/Ubuntu/home/kostia/projects/rozklad/workers/api/migrations/0001_initial.sql).

### Таблиці
1. **`users`** (`id`, `created_at`, `updated_at`) — ізольований запис студента без зайвої реєстрації.
2. **`user_devices`** (`id`, `user_id`, `device_name`, `token_hash` UNIQUE, `created_at`, `last_seen_at`, `revoked_at`) — підтримка кількох пристроїв на одного користувача; у БД зберігається **лише SHA-256 хеш** `syncToken`, підтримується відкликання (`revoked_at`) та ротація токена.
3. **`student_profiles`** (`user_id` PK/FK, `university_id`, `faculty_id`, `faculty_name`, `course`, `group_id`, `group_name`, `subgroup`, `elective_course`, `timezone`, `updated_at`) — персональний профіль студента.
4. **`universities`** (`id`, `name`, `short_name`, `city`, `support_status`, `source_url`) — реєстр університетів (`lnu`, `other`).
5. **`university_groups`** (`id`, `university_id`, `faculty_id`, `course`, `group_code`, `group_name`, `content_hash`, `last_synced_at`, `created_at`) — спільний довідник груп і метадані кешу розкладу групи.
6. **`schedule_entries`** (`id`, `group_id`, `lesson_id`, `lesson_date`, `day_of_week`, `pair_number`, `start_time`, `end_time`, `subject`, `lesson_type`, `teacher`, `room`, `building`, `subgroup`, `is_elective`, `status`, `updated_at`) — **спільний кеш розкладу на рівні групи** з індексом `(group_id, lesson_date, pair_number)`.
7. **`schedule_sync_logs`** (`id`, `group_id`, `status`, `entries_count`, `error_message`, `synced_at`) — аудит синхронізацій із джерелами ВНЗ.
8. **`rate_limit_buckets`** (`bucket_key`, `count`, `reset_at`) — лімітування частоти запитів у D1.

---

## 2. Список API Endpoint-ів

- `GET /api/health` — перевірка стану Worker.
- `GET /api/universities` — список підтримуваних університетів.
- `GET /api/universities/:uniId/faculties` — факультети університету.
- `GET /api/universities/:uniId/groups?course=&q=` — кешований у D1 перелік груп (з фільтром по курсу та пошуку).
- `GET /api/schedule?universityId=lnu&group=ФЕП-33с&facultyId=&course=&force=0` — отримання нормалізованого розкладу зі **спільного групового кешу D1** (TTL 6 год); при збої джерела повертає останній валідний кеш (`stale: true`).
- `POST /api/auth/register` — створення користувача та першого пристрою; повертає `syncToken` **один раз** (у БД пишеться лише `SHA-256`).
- `GET /api/devices` *(Bearer)* — перелік пристроїв поточного користувача.
- `POST /api/devices/link` *(Bearer)* — прив'язка додаткового пристрою.
- `POST /api/devices/rotate` *(Bearer)* — перевипуск `syncToken` поточного пристрою (старий миттєво стає `401`).
- `DELETE /api/devices/:deviceId` *(Bearer)* — відкликання пристрою (строго `WHERE id = ? AND user_id = ?`, захист від IDOR).
- `GET /api/profile`, `PUT /api/profile` *(Bearer)* — читання та оновлення профілю з валідацією IANA `timezone`, курсу `1..6` та групи.

---

## 3. Локальний запуск та підключення Cloudflare

### Локальний запуск (без акаунта Cloudflare)
1. Скопіювати `workers/api/.dev.vars.example` у `workers/api/.dev.vars`.
2. У папці `workers/api`:
   ```bash
   npm install
   npx wrangler d1 migrations apply uni-schedule-db --local
   npm run dev
   ```
3. Для фронтенду створити `.env.local` із `.env.example` і вказати `VITE_API_BASE_URL=http://127.0.0.1:8787`.

### Підключення до вашого Cloudflare акаунта (коли будете готові до деплою)
1. Авторизуватися: `npx wrangler login`
2. Створити D1 базу: `npx wrangler d1 create uni-schedule-db`
3. Вставити отриманий `database_id` у `workers/api/wrangler.toml`.
4. Застосувати міграцію: `npx wrangler d1 migrations apply uni-schedule-db --remote`
5. Задати секрет: `npx wrangler secret put TOKEN_PEPPER`
6. Оновити `ALLOWED_ORIGINS` у `wrangler.toml` під ваш production-домен Vercel.
