import { errorResponse, jsonResponse, parseJsonBody } from '../security';
import type { AuthContext, Env } from '../types';

export type ServerAttendanceStatus = 'attended' | 'absent' | 'excused' | 'unmarked';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MUTATIONS_PER_SYNC = 500;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes max future clock tolerance

function normalizeStatus(raw: unknown): ServerAttendanceStatus | null {
  if (typeof raw !== 'string') return null;
  if (raw === 'present' || raw === 'attended') return 'attended';
  if (raw === 'absent') return 'absent';
  if (raw === 'excused') return 'excused';
  if (raw === 'unmarked') return 'unmarked';
  return null;
}

function isValidIsoTimestamp(raw: unknown): raw is string {
  if (typeof raw !== 'string' || raw.length < 10 || raw.length > 40) return false;
  const ms = Date.parse(raw);
  return Number.isFinite(ms);
}

/**
 * Clamps client timestamps so a device with a broken future clock (e.g. year 2099)
 * cannot permanently win LWW conflicts and lock out valid devices.
 */
export function clampClientTimestamp(clientIso: string, serverNowMs: number): string {
  const clientMs = Date.parse(clientIso);
  const maxAllowedMs = serverNowMs + MAX_CLOCK_SKEW_MS;
  const effectiveMs = Math.min(clientMs, maxAllowedMs);
  return new Date(effectiveMs).toISOString();
}

interface AttendanceDbRow {
  lesson_id: string;
  lesson_date: string;
  status: string;
  updated_at: string;
  server_version: number;
  server_updated_at: string;
  device_id: string | null;
}

function mapAttendanceRow(row: AttendanceDbRow) {
  return {
    lessonId: row.lesson_id,
    lessonDate: row.lesson_date,
    status: row.status === 'present' ? 'attended' : (row.status as ServerAttendanceStatus),
    updatedAt: row.updated_at,
    serverVersion: row.server_version ?? 1,
    serverUpdatedAt: row.server_updated_at || row.updated_at,
    ...(row.device_id ? { deviceId: row.device_id } : {}),
  };
}

export async function handleGetAttendance(
  url: URL,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const since = url.searchParams.get('since')?.trim();
  const from = url.searchParams.get('from')?.trim();
  const to = url.searchParams.get('to')?.trim();

  if (since && !isValidIsoTimestamp(since)) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний параметр since', 400, corsHeaders);
  }
  if ((from && !ISO_DATE_RE.test(from)) || (to && !ISO_DATE_RE.test(to))) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний діапазон дат (YYYY-MM-DD)', 400, corsHeaders);
  }

  let sql = `SELECT lesson_id, lesson_date, status, updated_at, server_version, server_updated_at, device_id
             FROM attendance_records
             WHERE user_id = ?`;
  const binds: unknown[] = [auth.userId];

  if (since) {
    sql += ` AND server_updated_at > ?`;
    binds.push(new Date(Date.parse(since)).toISOString());
  }
  if (from) {
    sql += ` AND lesson_date >= ?`;
    binds.push(from);
  }
  if (to) {
    sql += ` AND lesson_date <= ?`;
    binds.push(to);
  }

  sql += ` ORDER BY lesson_date ASC, lesson_id ASC`;

  const res = await env.DB.prepare(sql)
    .bind(...binds)
    .all<AttendanceDbRow>();

  const records = (res.results ?? []).map(mapAttendanceRow);
  return jsonResponse(
    {
      records,
      serverTime: new Date().toISOString(),
    },
    200,
    corsHeaders
  );
}

export async function handleSyncAttendance(
  request: Request,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const parsed = await parseJsonBody<{
    mutations?: unknown;
    lastSyncAt?: unknown;
  }>(request, 131072);

  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const { mutations, lastSyncAt } = parsed.data;
  if (!Array.isArray(mutations)) {
    return errorResponse('VALIDATION_ERROR', 'Поле mutations має бути масивом', 400, corsHeaders);
  }
  if (mutations.length > MAX_MUTATIONS_PER_SYNC) {
    return errorResponse(
      'VALIDATION_ERROR',
      `Максимум ${MAX_MUTATIONS_PER_SYNC} записів за одну синхронізацію`,
      400,
      corsHeaders
    );
  }
  if (lastSyncAt !== undefined && lastSyncAt !== null && !isValidIsoTimestamp(lastSyncAt)) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний lastSyncAt', 400, corsHeaders);
  }

  const serverNowMs = Date.now();
  const serverNowIso = new Date(serverNowMs).toISOString();
  const statements: D1PreparedStatement[] = [];

  for (const item of mutations) {
    if (typeof item !== 'object' || item === null) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний елемент у mutations', 400, corsHeaders);
    }
    const candidate = item as Record<string, unknown>;
    const lessonId = typeof candidate.lessonId === 'string' ? candidate.lessonId.trim() : '';
    const lessonDate = typeof candidate.lessonDate === 'string' ? candidate.lessonDate.trim() : '';
    const status = normalizeStatus(candidate.status);
    const rawUpdatedAt = isValidIsoTimestamp(candidate.updatedAt)
      ? candidate.updatedAt
      : null;
    const baseVersion =
      typeof candidate.baseVersion === 'number' &&
      Number.isInteger(candidate.baseVersion) &&
      candidate.baseVersion >= 0
        ? candidate.baseVersion
        : null;

    if (!lessonId || lessonId.length > 128) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний lessonId', 400, corsHeaders);
    }
    if (!ISO_DATE_RE.test(lessonDate)) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний lessonDate (YYYY-MM-DD)', 400, corsHeaders);
    }
    if (!status) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний статус відвідуваності', 400, corsHeaders);
    }
    if (!rawUpdatedAt) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний timestamp updatedAt', 400, corsHeaders);
    }

    const clampedUpdatedAt = clampClientTimestamp(rawUpdatedAt, serverNowMs);

    // Server-versioned LWW strictly scoped to auth.userId (IDOR-safe & clock-skew hardened)
    statements.push(
      env.DB.prepare(
        `INSERT INTO attendance_records (
           user_id, lesson_id, lesson_date, status, updated_at, server_version, server_updated_at, device_id
         ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
         ON CONFLICT(user_id, lesson_id, lesson_date) DO UPDATE SET
           status = excluded.status,
           updated_at = excluded.updated_at,
           server_version = attendance_records.server_version + 1,
           server_updated_at = excluded.server_updated_at,
           device_id = excluded.device_id
         WHERE (? IS NOT NULL AND attendance_records.server_version = ?)
            OR excluded.updated_at > attendance_records.updated_at`
      ).bind(
        auth.userId,
        lessonId,
        lessonDate,
        status,
        clampedUpdatedAt,
        serverNowIso,
        auth.deviceId,
        baseVersion,
        baseVersion
      )
    );
  }

  let applied = 0;
  let skippedOlder = 0;
  for (let i = 0; i < statements.length; i += 100) {
    const batchResults = await env.DB.batch(statements.slice(i, i + 100));
    for (const res of batchResults) {
      if (res.meta.changes && res.meta.changes > 0) {
        applied += 1;
      } else {
        skippedOlder += 1;
      }
    }
  }

  const serverTime = new Date().toISOString();
  const normalizedLastSyncAt =
    typeof lastSyncAt === 'string' ? new Date(Date.parse(lastSyncAt)).toISOString() : null;
  const pullSql =
    normalizedLastSyncAt !== null
      ? `SELECT lesson_id, lesson_date, status, updated_at, server_version, server_updated_at, device_id
         FROM attendance_records
         WHERE user_id = ? AND server_updated_at > ?
         ORDER BY lesson_date ASC, lesson_id ASC`
      : `SELECT lesson_id, lesson_date, status, updated_at, server_version, server_updated_at, device_id
         FROM attendance_records
         WHERE user_id = ?
         ORDER BY lesson_date ASC, lesson_id ASC`;

  const pullRes =
    normalizedLastSyncAt !== null
      ? await env.DB.prepare(pullSql).bind(auth.userId, normalizedLastSyncAt).all<AttendanceDbRow>()
      : await env.DB.prepare(pullSql).bind(auth.userId).all<AttendanceDbRow>();

  return jsonResponse(
    {
      applied,
      skippedOlder,
      serverTime,
      records: (pullRes.results ?? []).map(mapAttendanceRow),
    },
    200,
    corsHeaders
  );
}
