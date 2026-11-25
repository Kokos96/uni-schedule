import {
  getVerifiedLnuPrograms,
  hasVerifiedLnuCatalogForFaculty,
  resolveVerifiedLnuGroupMetadata,
  validateLnuAcademicSelection,
} from '../../../../src/data/lnuAcademicCatalog';
import { LnuAdapter } from '../../../../src/integrations/universities/lnu/lnuAdapter';
import {
  inferCourseFromGroupName,
  normalizeGroupHomoglyphs,
} from '../../../../src/integrations/universities/lnu/lnuParser';
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
      l.building ?? '',
      l.subgroup ?? 0,
      l.isElective ?? false,
      l.electiveKey ?? '',
      l.trackNumber ?? 0,
      l.weekType ?? '',
      l.groupLabel ?? '',
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
  const queryHomoglyph = query ? normalizeGroupHomoglyphs(query) : '';
  const facultyFilter = (url.searchParams.get('facultyId') ?? '').trim();
  const programFilter = (url.searchParams.get('programId') ?? '').trim();
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
        const capped = upstreamGroups.slice(0, 5000);
        const statements = capped.map((g) => {
          const verified = resolveVerifiedLnuGroupMetadata(g.name);
          const inferredCourse = g.course ?? inferCourseFromGroupName(g.name) ?? null;
          return env.DB.prepare(
            `INSERT INTO university_groups (
               id, university_id, faculty_id, course, group_code, group_name, created_at
             ) VALUES (?, 'lnu', ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               faculty_id = COALESCE(excluded.faculty_id, university_groups.faculty_id),
               course = COALESCE(excluded.course, university_groups.course),
               group_name = excluded.group_name`
          ).bind(
            `lnu:${g.name}`,
            verified?.facultyId ?? null,
            inferredCourse,
            g.name,
            g.name,
            now
          );
        });

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
    `SELECT group_code, group_name, course, faculty_id
     FROM university_groups
     WHERE university_id = 'lnu'
     ORDER BY group_name ASC`
  ).all<{ group_code: string; group_name: string; course: number | null; faculty_id?: string | null }>();

  const includeAll = url.searchParams.get('includeAll') === '1';
  const activeFaculty = !includeAll && facultyFilter && facultyFilter !== '0' ? facultyFilter : null;
  const activeProgram = !includeAll && programFilter ? programFilter : null;

  const filtered = (dbGroups.results ?? [])
    .map((row) => {
      const verified = resolveVerifiedLnuGroupMetadata(row.group_name);
      const effectiveCourse = row.course ?? inferCourseFromGroupName(row.group_name) ?? null;
      return {
        row,
        verified,
        effectiveCourse,
      };
    })
    .filter(({ row, verified, effectiveCourse }) => {
      // Strict verified academic hierarchy filtering:
      // Never include unknown/unverified groups in faculty-scoped or program-scoped results.
      if (activeFaculty) {
        if (!verified || verified.facultyId !== activeFaculty) {
          return false;
        }
      }
      if (activeProgram) {
        if (!verified || verified.programId !== activeProgram) {
          return false;
        }
      }
      if (courseFilter) {
        if (effectiveCourse !== courseFilter) {
          return false;
        }
      }
      if (query) {
        const lowerName = row.group_name.toLowerCase();
        if (!lowerName.includes(query) && !normalizeGroupHomoglyphs(row.group_name).includes(queryHomoglyph)) {
          return false;
        }
      }
      return true;
    })
    .map(({ row, verified, effectiveCourse }) => ({
      id: row.group_code,
      name: row.group_name,
      ...(verified ? { facultyId: verified.facultyId, facultyVerified: true } : { facultyVerified: false }),
      ...(verified ? { programId: verified.programId, programName: verified.programName } : {}),
      ...(effectiveCourse ? { course: effectiveCourse } : {}),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'uk'));

  const verifiedCount = filtered.filter((g) => g.facultyVerified).length;
  const unverifiedCount = filtered.length - verifiedCount;
  const programs = activeFaculty ? getVerifiedLnuPrograms(activeFaculty) : [];

  return jsonResponse(
    {
      groups: filtered,
      programs,
      meta: {
        facultyId: activeFaculty,
        programId: activeProgram,
        includeAll,
        verifiedCount,
        unverifiedCount,
        hasVerifiedCatalog: activeFaculty ? hasVerifiedLnuCatalogForFaculty(activeFaculty) : true,
        upstreamFacultyDiscoverySupported: false,
      },
    },
    200,
    corsHeaders
  );
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
  elective_key?: string | null;
  track_number?: number | null;
  week_type?: string | null;
  group_label?: string | null;
  status: string;
  updated_at: string;
}

async function readCachedGroupSchedule(
  db: D1Database,
  groupKey: string,
  groupName: string,
  fetchedAt: string,
  coverage?: { sourceType?: 'dated' | 'recurring' | null; coveredFrom?: string | null; coveredTo?: string | null; facultyId?: string | null }
): Promise<NormalizedSchedule | null> {
  const entries = await db
    .prepare(
      `SELECT lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time,
              subject, lesson_type, teacher, room, building, subgroup, is_elective,
              status, updated_at, elective_key, track_number, week_type, group_label
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
    ...(coverage?.facultyId ? { facultyId: coverage.facultyId } : {}),
    groupId: groupName,
    groupName,
    fetchedAt,
    sourceType: coverage?.sourceType ?? (rows.every((r) => r.lesson_date) ? 'dated' : 'recurring'),
    ...(coverage?.coveredFrom ? { coveredFrom: coverage.coveredFrom } : {}),
    ...(coverage?.coveredTo ? { coveredTo: coverage.coveredTo } : {}),
    lessons: rows.map((r) => {
      return {
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
        ...(r.elective_key ? { electiveKey: r.elective_key } : {}),
        ...(r.track_number != null ? { trackNumber: r.track_number } : {}),
        ...(r.week_type ? { weekType: r.week_type as ScheduleLesson['weekType'] } : {}),
        ...(r.group_label ? { groupLabel: r.group_label } : {}),
        status: (r.status as ScheduleLesson['status']) ?? 'active',
        universityId: 'lnu',
        updatedAt: r.updated_at,
      };
    }),
    warnings: [],
  };
}

export async function handleGetSchedule(
  url: URL,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const universityId = (url.searchParams.get('universityId') ?? 'lnu').trim();
  const groupName = (url.searchParams.get('group') ?? url.searchParams.get('groupId') ?? '').trim();
  const facultyId = (url.searchParams.get('facultyId') ?? '0').trim();
  const programId = (url.searchParams.get('programId') ?? '').trim();
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
  let resolvedGroupName = groupName;
  let groupKey = `${universityId}:${resolvedGroupName}`;
  const cacheTtl = parsePositiveInt(env.SCHEDULE_CACHE_TTL_SECONDS, 21600);

  const groupRow = await env.DB.prepare(
    `SELECT id, faculty_id, last_synced_at, content_hash,
            schedule_source_type, covered_from, covered_to
     FROM university_groups WHERE id = ?`
  )
    .bind(groupKey)
    .first<{
      id: string;
      faculty_id?: string | null;
      last_synced_at: string | null;
      content_hash: string | null;
      schedule_source_type: 'dated' | 'recurring' | null;
      covered_from: string | null;
      covered_to: string | null;
    }>();

  let effectiveGroupRow = groupRow;
  if (!effectiveGroupRow) {
    const requestedNorm = normalizeGroupHomoglyphs(groupName);
    const dirRows = await env.DB.prepare(
      `SELECT id, faculty_id, group_name, last_synced_at, content_hash,
              schedule_source_type, covered_from, covered_to
       FROM university_groups WHERE university_id = ?`
    ).bind(universityId).all<{
      id: string;
      faculty_id?: string | null;
      group_name: string;
      last_synced_at: string | null;
      content_hash: string | null;
      schedule_source_type: 'dated' | 'recurring' | null;
      covered_from: string | null;
      covered_to: string | null;
    }>();
    const homoglyphMatch = (dirRows.results ?? []).find(
      (r) => normalizeGroupHomoglyphs(r.group_name) === requestedNorm
    );
    if (homoglyphMatch) {
      effectiveGroupRow = homoglyphMatch;
      resolvedGroupName = homoglyphMatch.group_name;
      groupKey = homoglyphMatch.id;
    }
  }

  const requestedFaculty = facultyId && facultyId !== '0' ? facultyId : null;
  const requestedProgram = programId || null;
  const academicCheck = validateLnuAcademicSelection({
    groupName: resolvedGroupName,
    facultyId: requestedFaculty,
    programId: requestedProgram,
  });
  if (!academicCheck.ok) {
    return errorResponse('ACADEMIC_MISMATCH', academicCheck.reason, 400, corsHeaders);
  }

  const verifiedMeta = academicCheck.verified;
  const verifiedFacultyId = verifiedMeta?.facultyId ?? null;
  const inferredCourse = inferCourseFromGroupName(resolvedGroupName) ?? null;

  const facultyMatches =
    !requestedFaculty ||
    !verifiedFacultyId ||
    verifiedFacultyId === requestedFaculty;

  const cacheCoverage = effectiveGroupRow
    ? {
        sourceType: effectiveGroupRow.schedule_source_type,
        coveredFrom: effectiveGroupRow.covered_from,
        coveredTo: effectiveGroupRow.covered_to,
        facultyId: verifiedFacultyId,
      }
    : undefined;

  // Serve shared group cache if fresh, faculty-compatible, and not force-refreshed
  if (!force && effectiveGroupRow && facultyMatches && isFreshTimestamp(effectiveGroupRow.last_synced_at, cacheTtl)) {
    const cached = await readCachedGroupSchedule(
      env.DB,
      groupKey,
      resolvedGroupName,
      effectiveGroupRow.last_synced_at!,
      cacheCoverage
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
    const rawFresh = await lnuAdapter.fetchSchedule({
      universityId,
      facultyId: verifiedFacultyId ?? undefined,
      course: inferredCourse ?? course,
      groupId: resolvedGroupName,
      groupName: resolvedGroupName,
    });
    // Ensure fresh response carries ONLY verified faculty identity (matching cached responses).
    const fresh: NormalizedSchedule = {
      ...rawFresh,
      ...(verifiedFacultyId ? { facultyId: verifiedFacultyId } : { facultyId: undefined }),
    };
    if (!verifiedFacultyId) {
      delete fresh.facultyId;
    }

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
      if (effectiveGroupRow?.last_synced_at && facultyMatches) {
        const staleCache = await readCachedGroupSchedule(
          env.DB,
          groupKey,
          resolvedGroupName,
          effectiveGroupRow.last_synced_at,
          cacheCoverage
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

    // Ensure parent university_groups row exists BEFORE inserting schedule_entries.
    // Never write untrusted user-supplied facultyId or course into university_groups.
    await env.DB.prepare(
      `INSERT OR IGNORE INTO university_groups (
         id, university_id, faculty_id, course, group_code, group_name, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        groupKey,
        universityId,
        verifiedFacultyId,
        inferredCourse,
        resolvedGroupName,
        resolvedGroupName,
        now
      )
      .run();

    const publishMetadataStmt = env.DB.prepare(
      `UPDATE university_groups
       SET faculty_id = COALESCE(?, faculty_id),
           course = COALESCE(?, course),
           content_hash = ?,
           last_synced_at = ?,
           schedule_source_type = ?,
           covered_from = ?,
           covered_to = ?
       WHERE id = ?`
    ).bind(
      verifiedFacultyId,
      inferredCourse,
      contentHash,
      now,
      fresh.sourceType ?? 'dated',
      fresh.coveredFrom ?? null,
      fresh.coveredTo ?? null,
      groupKey
    );

    // A2 (BUG-006): Staged replacement — insert new rows with updated_at=now first;
    // only after all inserts succeed, atomically delete stale rows and publish metadata.
    if (effectiveGroupRow?.content_hash !== contentHash) {
      const insertStmts: D1PreparedStatement[] = [];
      for (const lesson of fresh.lessons) {
        insertStmts.push(
          env.DB.prepare(
            `INSERT INTO schedule_entries (
               id, group_id, lesson_id, lesson_date, day_of_week, pair_number,
               start_time, end_time, subject, lesson_type, teacher, room,
               building, subgroup, is_elective, status, updated_at,
               elective_key, track_number, week_type, group_label
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            now,
            lesson.electiveKey ?? null,
            lesson.trackNumber ?? null,
            lesson.weekType ?? null,
            lesson.groupLabel ?? null
          )
        );
      }
      try {
        for (let i = 0; i < insertStmts.length; i += 100) {
          await env.DB.batch(insertStmts.slice(i, i + 100));
        }
        await env.DB.batch([
          env.DB.prepare(
            `DELETE FROM schedule_entries WHERE group_id = ? AND updated_at != ?`
          ).bind(groupKey, now),
          publishMetadataStmt,
        ]);
      } catch (writeErr) {
        // Clean up any partial rows from this failed attempt; preserve prior valid rows
        await env.DB.prepare(
          `DELETE FROM schedule_entries WHERE group_id = ? AND updated_at = ?`
        ).bind(groupKey, now).run().catch(() => {});
        throw writeErr;
      }
    } else {
      await publishMetadataStmt.run();
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

    if (effectiveGroupRow?.last_synced_at && facultyMatches) {
      const staleCache = await readCachedGroupSchedule(
        env.DB,
        groupKey,
        resolvedGroupName,
        effectiveGroupRow.last_synced_at,
        cacheCoverage
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
