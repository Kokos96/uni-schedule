import { base64UrlToBytes } from '../push/webPush';
import { errorResponse, jsonResponse, parseJsonBody } from '../security';
import type { AuthContext, Env } from '../types';

const VALID_BEFORE_LESSON_MINUTES = new Set([5, 10, 15, 30]);
const VALID_BEFORE_END_MINUTES = new Set([5, 10, 15]);
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isSafePushEndpointUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'https:') return false;
  if (parsed.username || parsed.password || parsed.port) return false;
  const host = parsed.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')) {
    return false;
  }
  // Reject IPv4 and IPv6 literals
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':')) {
    return false;
  }
  return host.includes('.');
}

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
  schedule_change_enabled?: number;
  release_updates_enabled?: number;
  release_updates_enabled_at?: string | null;
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
  scheduleChangeEnabled: true,
  releaseUpdatesEnabled: false,
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
    scheduleChangeEnabled: row.schedule_change_enabled !== 0,
    releaseUpdatesEnabled: row.release_updates_enabled === 1,
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
    keys?: unknown;
  }>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const endpoint =
    typeof parsed.data.endpoint === 'string' ? parsed.data.endpoint.trim() : '';
  if (!endpoint || endpoint.length > 2048) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний push endpoint', 400, corsHeaders);
  }

  const rawKeys = parsed.data.keys;
  if (typeof rawKeys !== 'object' || rawKeys === null || Array.isArray(rawKeys)) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Некоректні ключі підписки (p256dh / auth)',
      400,
      corsHeaders
    );
  }
  const keysObj = rawKeys as Record<string, unknown>;
  const p256dh = typeof keysObj.p256dh === 'string' ? keysObj.p256dh.trim() : '';
  const authKey = typeof keysObj.auth === 'string' ? keysObj.auth.trim() : '';

  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return errorResponse('VALIDATION_ERROR', 'Некоректний push endpoint', 400, corsHeaders);
  }

  if (!isSafePushEndpointUrl(parsedEndpoint)) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Push endpoint повинен використовувати публічний HTTPS домен',
      400,
      corsHeaders
    );
  }

  let keysValid = false;
  if (p256dh && p256dh.length <= 256 && authKey && authKey.length <= 128) {
    try {
      const p256dhBytes = base64UrlToBytes(p256dh);
      const authBytes = base64UrlToBytes(authKey);
      keysValid = p256dhBytes.length === 65 && authBytes.length === 16;
    } catch {
      keysValid = false;
    }
  }

  if (!keysValid) {
    return errorResponse(
      'VALIDATION_ERROR',
      'Некоректні ключі підписки (p256dh / auth)',
      400,
      corsHeaders
    );
  }

  const existingOwner = await env.DB.prepare(
    `SELECT user_id FROM push_subscriptions WHERE endpoint = ? LIMIT 1`
  )
    .bind(endpoint)
    .first<{ user_id: string }>();

  if (existingOwner && existingOwner.user_id !== auth.userId) {
    return errorResponse(
      'CONFLICT',
      'Цей push endpoint вже зареєстрований іншим користувачем',
      409,
      corsHeaders
    );
  }

  const subId = crypto.randomUUID();
  const now = new Date().toISOString();
  const ua = request.headers.get('User-Agent')?.slice(0, 180) ?? null;

  await env.DB.batch([
    env.DB.prepare(
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
    ).bind(subId, auth.userId, auth.deviceId, endpoint, p256dh, authKey, ua, now),
    // Ensure default notification_preferences row exists and enable notifications
    env.DB.prepare(
      `INSERT INTO notification_preferences (user_id, enabled, updated_at)
       VALUES (?, 1, ?)
       ON CONFLICT(user_id) DO UPDATE SET enabled = 1, updated_at = excluded.updated_at`
    ).bind(auth.userId, now),
  ]);

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
            friday_enabled, friday_time, schedule_change_enabled,
            release_updates_enabled, release_updates_enabled_at, updated_at
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

  const existingRow = await env.DB.prepare(
    `SELECT user_id, enabled, morning_enabled, morning_time,
            before_lesson_enabled, before_lesson_minutes,
            before_end_enabled, before_end_minutes,
            evening_enabled, evening_time,
            friday_enabled, friday_time, schedule_change_enabled,
            release_updates_enabled, release_updates_enabled_at, updated_at
     FROM notification_preferences
     WHERE user_id = ?`
  )
    .bind(auth.userId)
    .first<PreferenceRow>();

  const base = existingRow ? mapPreferenceRow(existingRow) : DEFAULT_PREFERENCES;
  const b = parsed.data;

  const parseBool = (
    val: unknown,
    fallback: boolean,
    field: string
  ): { ok: true; value: boolean } | { ok: false; field: string } => {
    if (val === undefined) return { ok: true, value: fallback };
    if (typeof val !== 'boolean') return { ok: false, field };
    return { ok: true, value: val };
  };

  const parseTime = (
    val: unknown,
    fallback: string,
    field: string
  ): { ok: true; value: string } | { ok: false; field: string } => {
    if (val === undefined) return { ok: true, value: fallback };
    if (typeof val !== 'string' || !HHMM_RE.test(val)) return { ok: false, field };
    return { ok: true, value: val };
  };

  const parseAllowedInt = (
    val: unknown,
    allowed: Set<number>,
    fallback: number,
    field: string
  ): { ok: true; value: number } | { ok: false; field: string } => {
    if (val === undefined) return { ok: true, value: fallback };
    if (typeof val !== 'number' || !Number.isInteger(val) || !allowed.has(val)) {
      return { ok: false, field };
    }
    return { ok: true, value: val };
  };

  const rEnabled = parseBool(b.enabled, base.enabled, 'enabled');
  const rMorningEnabled = parseBool(b.morningEnabled, base.morningEnabled, 'morningEnabled');
  const rMorningTime = parseTime(b.morningTime, base.morningTime, 'morningTime');
  const rBeforeLessonEnabled = parseBool(
    b.beforeLessonEnabled,
    base.beforeLessonEnabled,
    'beforeLessonEnabled'
  );
  const rBeforeLessonMin = parseAllowedInt(
    b.beforeLessonMinutes,
    VALID_BEFORE_LESSON_MINUTES,
    base.beforeLessonMinutes,
    'beforeLessonMinutes'
  );
  const rBeforeEndEnabled = parseBool(
    b.beforeEndEnabled,
    base.beforeEndEnabled,
    'beforeEndEnabled'
  );
  const rBeforeEndMin = parseAllowedInt(
    b.beforeEndMinutes,
    VALID_BEFORE_END_MINUTES,
    base.beforeEndMinutes,
    'beforeEndMinutes'
  );
  const rEveningEnabled = parseBool(b.eveningEnabled, base.eveningEnabled, 'eveningEnabled');
  const rEveningTime = parseTime(b.eveningTime, base.eveningTime, 'eveningTime');
  const rFridayEnabled = parseBool(b.fridayEnabled, base.fridayEnabled, 'fridayEnabled');
  const rFridayTime = parseTime(b.fridayTime, base.fridayTime, 'fridayTime');
  const rScheduleChangeEnabled = parseBool(
    b.scheduleChangeEnabled,
    base.scheduleChangeEnabled,
    'scheduleChangeEnabled'
  );
  const rReleaseUpdatesEnabled = parseBool(
    b.releaseUpdatesEnabled,
    base.releaseUpdatesEnabled,
    'releaseUpdatesEnabled'
  );

  const results = [
    rEnabled,
    rMorningEnabled,
    rMorningTime,
    rBeforeLessonEnabled,
    rBeforeLessonMin,
    rBeforeEndEnabled,
    rBeforeEndMin,
    rEveningEnabled,
    rEveningTime,
    rFridayEnabled,
    rFridayTime,
    rScheduleChangeEnabled,
    rReleaseUpdatesEnabled,
  ];
  const invalid = results.find((r) => !r.ok);
  if (invalid && !invalid.ok) {
    return errorResponse(
      'VALIDATION_ERROR',
      `Некоректне значення поля ${invalid.field}`,
      400,
      corsHeaders
    );
  }

  const enabled = (rEnabled as { ok: true; value: boolean }).value;
  const morningEnabled = (rMorningEnabled as { ok: true; value: boolean }).value;
  const morningTime = (rMorningTime as { ok: true; value: string }).value;
  const beforeLessonEnabled = (rBeforeLessonEnabled as { ok: true; value: boolean }).value;
  const beforeLessonMinutes = (rBeforeLessonMin as { ok: true; value: number }).value;
  const beforeEndEnabled = (rBeforeEndEnabled as { ok: true; value: boolean }).value;
  const beforeEndMinutes = (rBeforeEndMin as { ok: true; value: number }).value;
  const eveningEnabled = (rEveningEnabled as { ok: true; value: boolean }).value;
  const eveningTime = (rEveningTime as { ok: true; value: string }).value;
  const fridayEnabled = (rFridayEnabled as { ok: true; value: boolean }).value;
  const fridayTime = (rFridayTime as { ok: true; value: string }).value;
  const scheduleChangeEnabled = (rScheduleChangeEnabled as { ok: true; value: boolean }).value;
  const releaseUpdatesEnabled = (rReleaseUpdatesEnabled as { ok: true; value: boolean }).value;

  const now = new Date().toISOString();
  // Server-managed consent timestamp:
  // - missing field from older v4.2.1 clients preserves both state & original timestamp
  // - false -> true records a fresh server timestamp
  // - true -> true preserves the original consent timestamp
  // - true -> false revokes consent timestamp (NULL)
  const prevReleaseEnabled = base.releaseUpdatesEnabled;
  const prevReleaseEnabledAt = existingRow?.release_updates_enabled_at ?? null;
  let releaseUpdatesEnabledAt: string | null;
  if (b.releaseUpdatesEnabled === undefined) {
    releaseUpdatesEnabledAt = prevReleaseEnabled ? prevReleaseEnabledAt : null;
  } else if (releaseUpdatesEnabled) {
    releaseUpdatesEnabledAt = prevReleaseEnabled && prevReleaseEnabledAt ? prevReleaseEnabledAt : now;
  } else {
    releaseUpdatesEnabledAt = null;
  }

  await env.DB.prepare(
    `INSERT INTO notification_preferences (
       user_id, enabled, morning_enabled, morning_time,
       before_lesson_enabled, before_lesson_minutes,
       before_end_enabled, before_end_minutes,
       evening_enabled, evening_time,
       friday_enabled, friday_time, schedule_change_enabled,
       release_updates_enabled, release_updates_enabled_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       schedule_change_enabled = excluded.schedule_change_enabled,
       release_updates_enabled = excluded.release_updates_enabled,
       release_updates_enabled_at = excluded.release_updates_enabled_at,
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
      scheduleChangeEnabled ? 1 : 0,
      releaseUpdatesEnabled ? 1 : 0,
      releaseUpdatesEnabledAt,
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
        scheduleChangeEnabled,
        releaseUpdatesEnabled,
        updatedAt: now,
      },
    },
    200,
    corsHeaders
  );
}
