import {
  generateSyncToken,
  hashSyncToken,
  jsonResponse,
  errorResponse,
  parseJsonBody,
} from '../security';
import type { AuthContext, Env } from '../types';

function sanitizeDeviceName(raw: unknown): string {
  if (typeof raw !== 'string') return 'Web Browser';
  const cleaned = raw.trim().slice(0, 64);
  return cleaned.length > 0 ? cleaned : 'Web Browser';
}

export async function handleRegisterUser(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const parsed = await parseJsonBody<{ deviceName?: unknown }>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const userId = crypto.randomUUID();
  const deviceId = crypto.randomUUID();
  const deviceName = sanitizeDeviceName(parsed.data.deviceName);
  const syncToken = generateSyncToken();
  const tokenHash = await hashSyncToken(syncToken, env.TOKEN_PEPPER ?? '');
  const now = new Date().toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)`
    ).bind(userId, now, now),
    env.DB.prepare(
      `INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, NULL)`
    ).bind(deviceId, userId, deviceName, tokenHash, now, now),
    env.DB.prepare(
      `INSERT INTO student_profiles (
         user_id, university_id, faculty_id, faculty_name, course,
         group_id, group_name, subgroup, elective_course, timezone, updated_at
       ) VALUES (?, 'lnu', '1005', 'Факультет електроніки та комп''ютерних технологій', 3, 'ФЕП-33с', 'ФЕП-33с', 1, 'freelance', 'Europe/Kyiv', ?)`
    ).bind(userId, now),
  ]);

  return jsonResponse(
    {
      userId,
      deviceId,
      deviceName,
      syncToken,
    },
    201,
    corsHeaders
  );
}

export async function handleListDevices(
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT id, device_name, created_at, last_seen_at, revoked_at
     FROM user_devices
     WHERE user_id = ?
     ORDER BY created_at DESC`
  )
    .bind(auth.userId)
    .all<{
      id: string;
      device_name: string;
      created_at: string;
      last_seen_at: string;
      revoked_at: string | null;
    }>();

  const devices = (result.results ?? []).map((row) => ({
    id: row.id,
    deviceName: row.device_name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    isCurrent: row.id === auth.deviceId,
  }));

  return jsonResponse({ devices }, 200, corsHeaders);
}

export async function handleLinkDevice(
  request: Request,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const parsed = await parseJsonBody<{ deviceName?: unknown }>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const deviceId = crypto.randomUUID();
  const deviceName = sanitizeDeviceName(parsed.data.deviceName);
  const syncToken = generateSyncToken();
  const tokenHash = await hashSyncToken(syncToken, env.TOKEN_PEPPER ?? '');
  const now = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`
  )
    .bind(deviceId, auth.userId, deviceName, tokenHash, now, now)
    .run();

  return jsonResponse(
    {
      userId: auth.userId,
      deviceId,
      deviceName,
      syncToken,
    },
    201,
    corsHeaders
  );
}

export async function handleRotateToken(
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const nextToken = generateSyncToken();
  const nextHash = await hashSyncToken(nextToken, env.TOKEN_PEPPER ?? '');
  const now = new Date().toISOString();

  const res = await env.DB.prepare(
    `UPDATE user_devices
     SET token_hash = ?, last_seen_at = ?
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  )
    .bind(nextHash, now, auth.deviceId, auth.userId)
    .run();

  if (!res.meta.changes) {
    return errorResponse('UNAUTHORIZED', 'Пристрій не знайдено або відкликано', 401, corsHeaders);
  }

  return jsonResponse(
    {
      deviceId: auth.deviceId,
      syncToken: nextToken,
      rotatedAt: now,
    },
    200,
    corsHeaders
  );
}

export async function handleRevokeDevice(
  deviceId: string,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!deviceId || deviceId.length > 64) {
    return errorResponse('BAD_REQUEST', 'Некоректний ID пристрою', 400, corsHeaders);
  }

  const now = new Date().toISOString();
  // Strict user_id scoping prevents IDOR across users
  const res = await env.DB.prepare(
    `UPDATE user_devices
     SET revoked_at = ?
     WHERE id = ? AND user_id = ? AND revoked_at IS NULL`
  )
    .bind(now, deviceId, auth.userId)
    .run();

  if (!res.meta.changes) {
    return errorResponse('NOT_FOUND', 'Пристрій не знайдено або вже відкликано', 404, corsHeaders);
  }

  return jsonResponse(
    {
      revoked: true,
      deviceId,
      revokedAt: now,
    },
    200,
    corsHeaders
  );
}
