import { LnuAdapter } from '../../../../src/integrations/universities/lnu/lnuAdapter';
import { listUniversities } from '../../../../src/integrations/universities/registry';
import type {
  NormalizedSchedule,
  ScheduleLesson,
} from '../../../../src/integrations/universities/types';
import { errorResponse, jsonResponse } from '../security';
import type { Env } from '../types';

const lnuAdapter = new LnuAdapter();

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.floor(num) : fallback;
}

function isFreshTimestamp(iso: string | null, ttlSeconds: number): boolean {
  if (!iso) return false;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return false;
  return Date.now() - ms < ttlSeconds * 1000;
}

async function computeContentHash(lessons: readonly ScheduleLesson[]): Promise<string> {
  const canonical = JSON.stringify(
    lessons.map((l) => [
      l.id,
      l.date ?? '',
      l.startTime,
      l.endTime,
      l.subject,
      l.lessonType,
      l.teacher ?? '',
      l.room ?? '',
      l.subgroup ?? 0,
      l.status ?? 'active',
    ])
  );
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(canonical)
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function handleListUniversities(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const dbRows = await env.DB.prepare(
    `SELECT id, name, short_name, city, support_status, source_url FROM universities ORDER BY id ASC`
  ).all<{
    id: string;
    name: string;
    short_name: string;
    city: string;
    support_status: 'live' | 'manual_only';
    source_url: string | null;
  }>();

  const registryMeta = new Map(listUniversities().map((u) => [u.id, u]));
  const rows = dbRows.results ?? [];
  const universities =
    rows.length > 0
      ? rows.map((row) => {
          const meta = registryMeta.get(row.id);
          return {
            id: row.id,
            name: row.name,
            shortName: row.short_name,
            city: row.city,
            supportStatus: row.support_status,
            capabilities: meta?.capabilities ?? {
              hasFaculties: false,
              hasPrograms: false,
              hasCourses: false,
              hasGroups: false,
              hasSubgroups: true,
            },
            sourceNote: meta?.sourceNote ?? '',
          };
        })
      : listUniversities();

  return jsonResponse({ universities }, 200, corsHeaders);
}

export async function handleGetFaculties(
  uniId: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (uniId === 'lnu') {
    const faculties = await lnuAdapter.getFaculties();
    return jsonResponse({ faculties }, 200, corsHeaders);
  }
  if (uniId === 'other') {
    return jsonResponse({ faculties: [] }, 200, corsHeaders);
  }
  return errorResponse('NOT_FOUND', 'Університет не знайдено', 404, corsHeaders);
}

export async function handleGetGroups(
  uniId: string,
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (uniId !== 'lnu' && uniId !== 'other') {
    return errorResponse('NOT_FOUND', 'Університет не знайдено', 404, corsHeaders);
  }

  const courseParam = url.searchParams.get('course');
  if (courseParam !== null && courseParam !== '' && !/^[1-6]$/.test(courseParam)) {
    return errorResponse('VALIDATION_ERROR', 'Курс має бути від 1 до 6', 400, corsHeaders);
  }

  if (uniId === 'other') {
    return jsonResponse({ groups: [] }, 200, corsHeaders);
  }

  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const courseFilter = courseParam ? Number(courseParam) : undefined;

  const groupsTtl = parsePositiveInt(env.GROUPS_CACHE_TTL_SECONDS, 86400);

  // Track directory sync freshness in schedule_sync_logs separately from per-group schedule caching
  const directoryLogKey = 'lnu:__directory__';
  const [countRow, dirSyncRow] = await Promise.all([
    env.DB.prepare(
      `SELECT COUNT(*) as total FROM university_groups WHERE university_id = ?`
    )
      .bind('lnu')
      .first<{ total: number }>(),
    env.DB.prepare(
      `SELECT synced_at, entries_count
       FROM schedule_sync_logs
       WHERE group_id = ? AND status = 'success'
       ORDER BY synced_at DESC
       LIMIT 1`
    )
      .bind(directoryLogKey)
      .first<{ synced_at: string | null; entries_count: number }>(),
  ]);

  const existingTotal = countRow?.total ?? 0;
  const hasFreshDirectory =
    existingTotal > 0 &&
    Boolean(dirSyncRow && dirSyncRow.entries_count > 0) &&
    isFreshTimestamp(dirSyncRow?.synced_at ?? null, groupsTtl);

  if (!hasFreshDirectory) {
    const now = new Date().toISOString();
    try {
      const upstreamGroups = await lnuAdapter.getGroups(undefined, {
        ttlMs: groupsTtl * 1000,
        forceRefresh: true,
      });

      if (upstreamGroups.length === 0) {
        await env.DB.prepare(
          `INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
           VALUES (?, ?, 'skipped', 0, ?, ?)`
        )
          .bind(crypto.randomUUID(), directoryLogKey, 'Порожній список груп від ЛНУ', now)
          .run();

        if (existingTotal === 0) {
          return errorResponse(
            'UPSTREAM_UNAVAILABLE',
            'Не вдалося завантажити перелік груп із сервера ЛНУ',
            502,
            corsHeaders
          );
        }
      } else {
        const capped = upstreamGroups.slice(0, 1500);
        const statements = capped.map((g) =>
          env.DB.prepare(
            `INSERT INTO university_groups (
               id, university_id, faculty_id, course, group_code, group_name, created_at
             ) VALUES (?, 'lnu', NULL, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               course = COALESCE(excluded.course, university_groups.course),
               group_name = excluded.group_name`
          ).bind(`lnu:${g.name}`, g.course ?? null, g.name, g.name, now)
        );

        // Batch in chunks of 100 statements for D1 limits
        for (let i = 0; i < statements.length; i += 100) {
          await env.DB.batch(statements.slice(i, i + 100));
        }

        await env.DB.prepare(
          `INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
           VALUES (?, ?, 'success', ?, NULL, ?)`
        )
          .bind(crypto.randomUUID(), directoryLogKey, capped.length, now)
          .run();
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message.slice(0, 240) : 'Upstream groups sync failed';
      await env.DB.prepare(
        `INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
         VALUES (?, ?, 'error', 0, ?, ?)`
      )
        .bind(crypto.randomUUID(), directoryLogKey, errMsg, now)
        .run();

      if (existingTotal === 0) {
        return errorResponse(
          'UPSTREAM_UNAVAILABLE',
          'Не вдалося завантажити перелік груп із сервера ЛНУ',
          502,
          corsHeaders
        );
      }
    }
  }

  const dbGroups = await env.DB.prepare(
    `SELECT group_code, group_name, course
     FROM university_groups
     WHERE university_id = 'lnu'
     ORDER BY group_name ASC`
  ).all<{ group_code: string; group_name: string; course: number | null }>();

  const filtered = (dbGroups.results ?? [])
    .filter((row) => {
      if (courseFilter && row.course !== null && row.course !== courseFilter) {
        return false;
      }
      if (query && !row.group_name.toLowerCase().includes(query)) {
        return false;
      }
      return true;
    })
    .map((row) => ({
      id: row.group_code,
      name: row.group_name,
      ...(row.course ? { course: row.course } : {}),
    }));

  return jsonResponse({ groups: filtered }, 200, corsHeaders);
}

interface ScheduleEntryRow {
  lesson_id: string;
  lesson_date: string | null;
  day_of_week: number;
  pair_number: number;
  start_time: string;
  end_time: string;
  subject: string;
  lesson_type: string;
  teacher: string | null;
  room: string | null;
  building: string | null;
  subgroup: number | null;
  is_elective: number;
  status: string;
  updated_at: string;
}

async function readCachedGroupSchedule(
  db: D1Database,
  groupKey: string,
  groupName: string,
  fetchedAt: string
): Promise<NormalizedSchedule | null> {
  const entries = await db
    .prepare(
      `SELECT lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time,
              subject, lesson_type, teacher, room, building, subgroup, is_elective,
              status, updated_at
       FROM schedule_entries
       WHERE group_id = ?
       ORDER BY lesson_date ASC, pair_number ASC`
    )
    .bind(groupKey)
    .all<ScheduleEntryRow>();

  const rows = entries.results ?? [];
  if (rows.length === 0) return null;

  return {
    universityId: 'lnu',
    universityName: 'ЛНУ ім. Івана Франка',
    groupId: groupName,
    groupName,
    fetchedAt,
    lessons: rows.map((r) => ({
      id: r.lesson_id,
      ...(r.lesson_date ? { date: r.lesson_date } : {}),
      dayOfWeek: r.day_of_week,
      number: r.pair_number,
      startTime: r.start_time,
      endTime: r.end_time,
      subject: r.subject,
      lessonType: r.lesson_type,
      ...(r.teacher ? { teacher: r.teacher } : {}),
      ...(r.room ? { room: r.room } : {}),
      ...(r.building ? { building: r.building } : {}),
      ...(r.subgroup === 1 || r.subgroup === 2 ? { subgroup: r.subgroup } : {}),
      ...(r.is_elective === 1 ? { isElective: true } : {}),
      status: (r.status as ScheduleLesson['status']) ?? 'active',
      universityId: 'lnu',
      updatedAt: r.updated_at,
    })),
    warnings: [],
  };
}

export async function handleGetSchedule(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const universityId = (url.searchParams.get('universityId') ?? 'lnu').trim();
  const groupName = (url.searchParams.get('group') ?? '').trim();
  const facultyId = (url.searchParams.get('facultyId') ?? '0').trim();
  const courseParam = url.searchParams.get('course');
  const force = url.searchParams.get('force') === '1';

  if (universityId === 'other') {
    return errorResponse(
      'UNSUPPORTED_UNIVERSITY',
      'Автоматичне отримання розкладу для обраного університету ще не підключено.',
      400,
      corsHeaders
    );
  }
  if (universityId !== 'lnu') {
    return errorResponse('NOT_FOUND', 'Університет не знайдено', 404, corsHeaders);
  }
  if (!groupName || groupName.length > 64) {
    return errorResponse('VALIDATION_ERROR', 'Вкажіть коректну назву групи', 400, corsHeaders);
  }

  const course =
    courseParam && /^[1-6]$/.test(courseParam) ? Number(courseParam) : undefined;
  const groupKey = `${universityId}:${groupName}`;
  const cacheTtl = parsePositiveInt(env.SCHEDULE_CACHE_TTL_SECONDS, 21600);

  const groupRow = await env.DB.prepare(
    `SELECT id, last_synced_at, content_hash FROM university_groups WHERE id = ?`
  )
    .bind(groupKey)
    .first<{ id: string; last_synced_at: string | null; content_hash: string | null }>();

  // Serve shared group cache if fresh and not force-refreshed
  if (!force && groupRow && isFreshTimestamp(groupRow.last_synced_at, cacheTtl)) {
    const cached = await readCachedGroupSchedule(
      env.DB,
      groupKey,
      groupName,
      groupRow.last_synced_at!
    );
    if (cached) {
      return jsonResponse(
        { schedule: cached, cacheHit: true, stale: false },
        200,
        corsHeaders
      );
    }
  }

  const now = new Date().toISOString();
  try {
    const fresh = await lnuAdapter.fetchSchedule({
      universityId,
      facultyId: facultyId || undefined,
      course,
      groupId: groupName,
      groupName,
    });

    if (fresh.lessons.length === 0) {
      await env.DB.prepare(
        `INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
         VALUES (?, ?, 'skipped', 0, ?, ?)`
      )
        .bind(
          crypto.randomUUID(),
          groupKey,
          fresh.warnings[0] ?? 'Порожній розклад від джерела',
          now
        )
        .run();

      // Preserve existing cached schedule if upstream returned empty
      if (groupRow?.last_synced_at) {
        const staleCache = await readCachedGroupSchedule(
          env.DB,
          groupKey,
          groupName,
          groupRow.last_synced_at
        );
        if (staleCache) {
          staleCache.warnings.push(
            'Сервер університету повернув порожній розклад — показано останню збережену версію.'
          );
          return jsonResponse(
            { schedule: staleCache, cacheHit: true, stale: true },
            200,
            corsHeaders
          );
        }
      }

      return jsonResponse(
        { schedule: fresh, cacheHit: false, stale: false },
        200,
        corsHeaders
      );
    }

    const contentHash = await computeContentHash(fresh.lessons);

    await env.DB.prepare(
      `INSERT INTO university_groups (
         id, university_id, faculty_id, course, group_code, group_name,
         content_hash, last_synced_at, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         faculty_id = COALESCE(excluded.faculty_id, university_groups.faculty_id),
         course = COALESCE(excluded.course, university_groups.course),
         content_hash = excluded.content_hash,
         last_synced_at = excluded.last_synced_at`
    )
      .bind(
        groupKey,
        universityId,
        facultyId !== '0' ? facultyId : null,
        course ?? null,
        groupName,
        groupName,
        contentHash,
        now,
        now
      )
      .run();

    // Only rewrite entries if content actually changed (or first sync)
    if (groupRow?.content_hash !== contentHash) {
      const batch: D1PreparedStatement[] = [
        env.DB.prepare(`DELETE FROM schedule_entries WHERE group_id = ?`).bind(groupKey),
      ];
      for (const lesson of fresh.lessons) {
        batch.push(
          env.DB.prepare(
            `INSERT INTO schedule_entries (
               id, group_id, lesson_id, lesson_date, day_of_week, pair_number,
               start_time, end_time, subject, lesson_type, teacher, room,
               building, subgroup, is_elective, status, updated_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            groupKey,
            lesson.id,
            lesson.date ?? null,
            lesson.dayOfWeek,
            lesson.number,
            lesson.startTime,
            lesson.endTime,
            lesson.subject,
            lesson.lessonType,
            lesson.teacher ?? null,
            lesson.room ?? null,
            lesson.building ?? null,
            lesson.subgroup ?? null,
            lesson.isElective ? 1 : 0,
            lesson.status ?? 'active',
            now
          )
        );
      }
      for (let i = 0; i < batch.length; i += 100) {
        await env.DB.batch(batch.slice(i, i + 100));
      }
    }

    await env.DB.prepare(
      `INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
       VALUES (?, ?, 'success', ?, NULL, ?)`
    )
      .bind(crypto.randomUUID(), groupKey, fresh.lessons.length, now)
      .run();

    return jsonResponse(
      { schedule: fresh, cacheHit: false, stale: false },
      200,
      corsHeaders
    );
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message.slice(0, 240) : 'Upstream sync failed';
    await env.DB.prepare(
      `INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
       VALUES (?, ?, 'error', 0, ?, ?)`
    )
      .bind(crypto.randomUUID(), groupKey, errMsg, now)
      .run();

    if (groupRow?.last_synced_at) {
      const staleCache = await readCachedGroupSchedule(
        env.DB,
        groupKey,
        groupName,
        groupRow.last_synced_at
      );
      if (staleCache) {
        staleCache.warnings.push(
          'Сервер університету тимчасово недоступний — показано кешований розклад.'
        );
        return jsonResponse(
          { schedule: staleCache, cacheHit: true, stale: true },
          200,
          corsHeaders
        );
      }
    }

    return errorResponse(
      'UPSTREAM_UNAVAILABLE',
      'Не вдалося отримати розклад із сервера університету',
      502,
      corsHeaders
    );
  }
}
