import { errorResponse, jsonResponse, parseJsonBody } from '../security';
import type { AuthContext, Env } from '../types';

const VALID_BEFORE_LESSON_MINUTES = new Set([5, 10, 15, 30]);
const VALID_BEFORE_END_MINUTES = new Set([5, 10, 15]);
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

interface PreferenceRow {
  user_id: string;
  enabled: number;
  morning_enabled: number;
  morning_time: string;
  before_lesson_enabled: number;
  before_lesson_minutes: number;
  before_end_enabled: number;
  before_end_minutes: number;
  evening_enabled: number;
  evening_time: string;
  friday_enabled: number;
  friday_time: string;
  updated_at: string;
}

const DEFAULT_PREFERENCES = {
  enabled: false,
  morningEnabled: true,
  morningTime: '08:00',
  beforeLessonEnabled: true,
  beforeLessonMinutes: 10,
  beforeEndEnabled: false,
  beforeEndMinutes: 10,
  eveningEnabled: true,
  eveningTime: '20:00',
  fridayEnabled: true,
  fridayTime: '18:00',
};

function mapPreferenceRow(row: PreferenceRow) {
  return {
    enabled: row.enabled === 1,
    morningEnabled: row.morning_enabled === 1,
    morningTime: row.morning_time,
    beforeLessonEnabled: row.before_lesson_enabled === 1,
    beforeLessonMinutes: row.before_lesson_minutes,
    beforeEndEnabled: row.before_end_enabled === 1,
    beforeEndMinutes: row.before_end_minutes,
    eveningEnabled: row.evening_enabled === 1,
    eveningTime: row.evening_time,
    fridayEnabled: row.friday_enabled === 1,
    fridayTime: row.friday_time,
    updatedAt: row.updated_at,
  };
}

export function handleGetVapidPublicKey(
  env: Env,
  corsHeaders: Record<string, string>
): Response {
  if (!env.VAPID_PUBLIC_KEY) {
    return errorResponse(
      'VAPID_NOT_CONFIGURED',
      'Публічний ключ VAPID ще не налаштований на сервері',
      503,
      corsHeaders
    );
  }
  return jsonResponse({ publicKey: env.VAPID_PUBLIC_KEY }, 200, corsHeaders);
}

export async function handleListPushSubscriptions(
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const res = await env.DB.prepare(
    `SELECT id, device_id, endpoint, user_agent, created_at, last_success_at, fail_count
     FROM push_subscriptions
     WHERE user_id = ?
     ORDER BY created_at DESC`
  )
    .bind(auth.userId)
    .all<{
      id: string;
      device_id: string;
      endpoint: string;
      user_agent: string | null;
      created_at: string;
      last_success_at: string | null;
      fail_count: number;
    }>();

  const subscriptions = (res.results ?? []).map((row) => ({
    id: row.id,
    deviceId: row.device_id,
    isCurrentDevice: row.device_id === auth.deviceId,
    endpointOrigin: (() => {
      try {
        return new URL(row.endpoint).origin;
      } catch {
        return 'unknown';
      }
    })(),
    userAgent: row.user_agent ?? undefined,
    createdAt: row.created_at,
    lastSuccessAt: row.last_success_at ?? undefined,
    failCount: row.fail_count,
  }));

  return jsonResponse({ subscriptions }, 200, corsHeaders);
}

export async function handleUpsertPushSubscription(
  request: Request,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const parsed = await parseJsonBody<{
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  }>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const endpoint =
    typeof parsed.data.endpoint === 'string' ? parsed.data.endpoint.trim() : '';
  const p256dh =
    typeof parsed.data.keys?.p256dh === 'string'
      ? parsed.data.keys.p256dh.trim()
      : '';
  const authKey =
    typeof parsed.data.keys?.auth === 'string'
      ? parsed.data.keys.auth.trim()
      : '';

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Некоректний push endpoint', 400, corsHeaders);
  }

  if (parsedEndpoint.protocol !== 'https:') {
    return errorResponse(
      'VALIDATION_ERROR',
      'Push endpoint повинен використовувати HTTPS',
      400,
      corsHeaders
    );
  }

  if (!p256dh || p256dh.length > 256 || !authKey || authKey.length > 128) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Некоректні ключі підписки (p256dh / auth)',
      400,
      corsHeaders
    );
  }

  const subId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ua = request.headers.get('User-Agent')?.slice(0, 180) ?? null;

  await env.DB.prepare(
    `INSERT INTO push_subscriptions (
       id, user_id, device_id, endpoint, p256dh, auth, user_agent, created_at, fail_count
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id,
       device_id = excluded.device_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent,
       fail_count = 0`
  )
    .bind(subId, auth.userId, auth.deviceId, endpoint, p256dh, authKey, ua, now)
    .run();

  // Ensure default notification_preferences row exists and enable notifications
  await env.DB.prepare(
    `INSERT INTO notification_preferences (user_id, enabled, updated_at)
     VALUES (?, 1, ?)
     ON CONFLICT(user_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at`
  )
    .bind(auth.userId, now)
    .run();

  return jsonResponse(
    {
      subscribed: true,
      deviceId: auth.deviceId,
      createdAt: now,
    },
    201,
    corsHeaders
  );
}

export async function handleDeletePushSubscription(
  subscriptionId: string,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  if (!subscriptionId || subscriptionId.length > 64) {
    return errorResponse('BAD_REQUEST', 'Некоректний ID підписки', 400, corsHeaders);
  }

  const res = await env.DB.prepare(
    `DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?`
  )
    .bind(subscriptionId, auth.userId)
    .run();

  if (!res.meta.changes) {
    return errorResponse('NOT_FOUND', 'Підписку не знайдено', 404, corsHeaders);
  }

  return jsonResponse({ deleted: true, id: subscriptionId }, 200, corsHeaders);
}

export async function handleGetNotificationPreferences(
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT user_id, enabled, morning_enabled, morning_time,
            before_lesson_enabled, before_lesson_minutes,
            before_end_enabled, before_end_minutes,
            evening_enabled, evening_time,
            friday_enabled, friday_time, updated_at
     FROM notification_preferences
     WHERE user_id = ?`
  )
    .bind(auth.userId)
    .first<PreferenceRow>();

  return jsonResponse(
    {
      preferences: row ? mapPreferenceRow(row) : DEFAULT_PREFERENCES,
    },
    200,
    corsHeaders
  );
}

export async function handleUpdateNotificationPreferences(
  request: Request,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const b = parsed.data;
  const enabled = typeof b.enabled === 'boolean' ? b.enabled : DEFAULT_PREFERENCES.enabled;
  const morningEnabled =
    typeof b.morningEnabled === 'boolean'
      ? b.morningEnabled
      : DEFAULT_PREFERENCES.morningEnabled;
  const morningTime =
    typeof b.morningTime === 'string' && HHMM_RE.test(b.morningTime)
      ? b.morningTime
      : DEFAULT_PREFERENCES.morningTime;

  const beforeLessonEnabled =
    typeof b.beforeLessonEnabled === 'boolean'
      ? b.beforeLessonEnabled
      : DEFAULT_PREFERENCES.beforeLessonEnabled;
  const beforeLessonMinutes =
    typeof b.beforeLessonMinutes === 'number' &&
    VALID_BEFORE_LESSON_MINUTES.has(b.beforeLessonMinutes)
      ? b.beforeLessonMinutes
      : DEFAULT_PREFERENCES.beforeLessonMinutes;

  const beforeEndEnabled =
    typeof b.beforeEndEnabled === 'boolean'
      ? b.beforeEndEnabled
      : DEFAULT_PREFERENCES.beforeEndEnabled;
  const beforeEndMinutes =
    typeof b.beforeEndMinutes === 'number' &&
    VALID_BEFORE_END_MINUTES.has(b.beforeEndMinutes)
      ? b.beforeEndMinutes
      : DEFAULT_PREFERENCES.beforeEndMinutes;

  const eveningEnabled =
    typeof b.eveningEnabled === 'boolean'
      ? b.eveningEnabled
      : DEFAULT_PREFERENCES.eveningEnabled;
  const eveningTime =
    typeof b.eveningTime === 'string' && HHMM_RE.test(b.eveningTime)
      ? b.eveningTime
      : DEFAULT_PREFERENCES.eveningTime;

  const fridayEnabled =
    typeof b.fridayEnabled === 'boolean'
      ? b.fridayEnabled
      : DEFAULT_PREFERENCES.fridayEnabled;
  const fridayTime =
    typeof b.fridayTime === 'string' && HHMM_RE.test(b.fridayTime)
      ? b.fridayTime
      : DEFAULT_PREFERENCES.fridayTime;

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO notification_preferences (
       user_id, enabled, morning_enabled, morning_time,
       before_lesson_enabled, before_lesson_minutes,
       before_end_enabled, before_end_minutes,
       evening_enabled, evening_time,
       friday_enabled, friday_time, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       enabled = excluded.enabled,
       morning_enabled = excluded.morning_enabled,
       morning_time = excluded.morning_time,
       before_lesson_enabled = excluded.before_lesson_enabled,
       before_lesson_minutes = excluded.before_lesson_minutes,
       before_end_enabled = excluded.before_end_enabled,
       before_end_minutes = excluded.before_end_minutes,
       evening_enabled = excluded.evening_enabled,
       evening_time = excluded.evening_time,
       friday_enabled = excluded.friday_enabled,
       friday_time = excluded.friday_time,
       updated_at = excluded.updated_at`
  )
    .bind(
      auth.userId,
      enabled ? 1 : 0,
      morningEnabled ? 1 : 0,
      morningTime,
      beforeLessonEnabled ? 1 : 0,
      beforeLessonMinutes,
      beforeEndEnabled ? 1 : 0,
      beforeEndMinutes,
      eveningEnabled ? 1 : 0,
      eveningTime,
      fridayEnabled ? 1 : 0,
      fridayTime,
      now
    )
    .run();

  return jsonResponse(
    {
      preferences: {
        enabled,
        morningEnabled,
        morningTime,
        beforeLessonEnabled,
        beforeLessonMinutes,
        beforeEndEnabled,
        beforeEndMinutes,
        eveningEnabled,
        eveningTime,
        fridayEnabled,
        fridayTime,
        updatedAt: now,
      },
    },
    200,
    corsHeaders
  );
}
