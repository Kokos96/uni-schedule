import { handleGetAttendance, handleSyncAttendance } from './routes/attendance';
import {
  handleLinkDevice,
  handleListDevices,
  handleRegisterUser,
  handleRevokeDevice,
  handleRotateToken,
} from './routes/authDevices';
import { handleGetProfile, handleUpdateProfile } from './routes/profile';
import {
  handleDeletePushSubscription,
  handleGetNotificationPreferences,
  handleGetVapidPublicKey,
  handleListPushSubscriptions,
  handleUpdateNotificationPreferences,
  handleUpsertPushSubscription,
} from './routes/push';
import {
  handleGetFaculties,
  handleGetGroups,
  handleGetSchedule,
  handleListUniversities,
} from './routes/universities';
import { runNotificationCron } from './push/scheduler';
import {
  authenticateRequest,
  checkRateLimit,
  errorResponse,
  getClientIdentifier,
  isOriginAllowed,
  jsonResponse,
  resolveCorsHeaders,
} from './security';
import type { Env } from './types';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const corsHeaders = resolveCorsHeaders(request, env);

    if (!isOriginAllowed(request, env)) {
      return errorResponse(
        'FORBIDDEN_ORIGIN',
        'Origin не дозволено політикою CORS',
        403,
        corsHeaders
      );
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health' && request.method === 'GET') {
        return jsonResponse(
          { ok: true, service: 'uni-schedule-api', stage: 3 },
          200,
          corsHeaders
        );
      }

      const clientIp = getClientIdentifier(request);
      const isWriteOrAuth =
        request.method !== 'GET' ||
        (path === '/api/schedule' && url.searchParams.get('force') === '1');
      const limitBucket = `${isWriteOrAuth ? 'w' : 'r'}:${clientIp}`;
      const limit = await checkRateLimit(
        env.DB,
        limitBucket,
        isWriteOrAuth ? 20 : 60,
        60
      );

      if (!limit.allowed) {
        return jsonResponse(
          {
            error: {
              code: 'RATE_LIMITED',
              message: 'Забагато запитів. Спробуйте за хвилину.',
            },
          },
          429,
          corsHeaders,
          { 'Retry-After': String(Math.max(1, limit.resetAt - Math.floor(Date.now() / 1000))) }
        );
      }

      // Public VAPID key & university catalog endpoints
      if (path === '/api/push/vapid-public-key' && request.method === 'GET') {
        return handleGetVapidPublicKey(env, corsHeaders);
      }

      if (path === '/api/universities' && request.method === 'GET') {
        return await handleListUniversities(env, corsHeaders);
      }

      const facultiesMatch = path.match(/^\/api\/universities\/([a-z0-9_-]+)\/faculties$/i);
      if (facultiesMatch && request.method === 'GET') {
        return await handleGetFaculties(facultiesMatch[1]!, corsHeaders);
      }

      const groupsMatch = path.match(/^\/api\/universities\/([a-z0-9_-]+)\/groups$/i);
      if (groupsMatch && request.method === 'GET') {
        return await handleGetGroups(groupsMatch[1]!, url, env, corsHeaders);
      }

      if (path === '/api/schedule' && request.method === 'GET') {
        return await handleGetSchedule(url, env, corsHeaders);
      }

      // Registration creates anonymous user + device + hashed syncToken
      if (path === '/api/auth/register' && request.method === 'POST') {
        return await handleRegisterUser(request, env, corsHeaders);
      }

      // Authenticated routes
      const auth = await authenticateRequest(request, env);
      if (!auth) {
        return errorResponse(
          'UNAUTHORIZED',
          'Потрібен дійсний syncToken у заголовку Authorization: Bearer',
          401,
          corsHeaders
        );
      }

      if (path === '/api/devices' && request.method === 'GET') {
        return await handleListDevices(auth, env, corsHeaders);
      }
      if (path === '/api/devices/link' && request.method === 'POST') {
        return await handleLinkDevice(request, auth, env, corsHeaders);
      }
      if (path === '/api/devices/rotate' && request.method === 'POST') {
        return await handleRotateToken(auth, env, corsHeaders);
      }

      const deleteDeviceMatch = path.match(/^\/api\/devices\/([a-zA-Z0-9-]+)$/);
      if (deleteDeviceMatch && request.method === 'DELETE') {
        return await handleRevokeDevice(deleteDeviceMatch[1]!, auth, env, corsHeaders);
      }

      if (path === '/api/profile' && request.method === 'GET') {
        return await handleGetProfile(auth, env, corsHeaders);
      }
      if (path === '/api/profile' && request.method === 'PUT') {
        return await handleUpdateProfile(request, auth, env, corsHeaders);
      }

      if (path === '/api/push/subscriptions' && request.method === 'GET') {
        return await handleListPushSubscriptions(auth, env, corsHeaders);
      }
      if (path === '/api/push/subscriptions' && request.method === 'POST') {
        return await handleUpsertPushSubscription(request, auth, env, corsHeaders);
      }
      const deleteSubMatch = path.match(/^\/api\/push\/subscriptions\/([a-zA-Z0-9-]+)$/);
      if (deleteSubMatch && request.method === 'DELETE') {
        return await handleDeletePushSubscription(deleteSubMatch[1]!, auth, env, corsHeaders);
      }

      if (path === '/api/notifications/preferences' && request.method === 'GET') {
        return await handleGetNotificationPreferences(auth, env, corsHeaders);
      }
      if (path === '/api/notifications/preferences' && request.method === 'PUT') {
        return await handleUpdateNotificationPreferences(request, auth, env, corsHeaders);
      }

      if (path === '/api/attendance' && request.method === 'GET') {
        return await handleGetAttendance(url, auth, env, corsHeaders);
      }
      if (path === '/api/attendance/sync' && request.method === 'POST') {
        return await handleSyncAttendance(request, auth, env, corsHeaders);
      }

      return errorResponse('NOT_FOUND', 'Маршрут не знайдено', 404, corsHeaders);
    } catch {
      // Never leak internal SQL or stack traces
      return errorResponse(
        'INTERNAL_ERROR',
        'Внутрішня помилка сервера',
        500,
        corsHeaders
      );
    }
  },

  async scheduled(
    event: ScheduledEvent,
    env: Env,
    ctx: ExecutionContext
  ): Promise<void> {
    const nowUtc = new Date(event.scheduledTime || Date.now());
    ctx.waitUntil(runNotificationCron(env, nowUtc));
  },
};
