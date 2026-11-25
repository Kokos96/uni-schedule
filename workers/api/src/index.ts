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
        try {
          const ping = await env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>();
          if (ping?.ok !== 1) {
            return errorResponse('DB_UNAVAILABLE', 'База даних недоступна', 503, corsHeaders);
          }
        } catch {
          return errorResponse('DB_UNAVAILABLE', 'База даних недоступна', 503, corsHeaders);
        }
        return jsonResponse(
          { ok: true, db: 'ok', service: 'uni-schedule-api', stage: 3, version: '3.6.0' },
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

      type RouteContext = {
        request: Request;
        url: URL;
        env: Env;
        corsHeaders: Record<string, string>;
        params: string[];
        auth?: Awaited<ReturnType<typeof authenticateRequest>>;
      };

      interface RouteDef {
        pattern: string | RegExp;
        methods: ReadonlyArray<'GET' | 'POST' | 'PUT' | 'DELETE'>;
        authRequired: boolean;
        handler: (ctx: RouteContext) => Promise<Response> | Response;
      }

      const routes: RouteDef[] = [
        {
          pattern: '/api/health',
          methods: ['GET'],
          authRequired: false,
          handler: ({ corsHeaders: ch }) =>
            jsonResponse({ ok: true, service: 'uni-schedule-api', stage: 3 }, 200, ch),
        },
        {
          pattern: '/api/push/vapid-public-key',
          methods: ['GET'],
          authRequired: false,
          handler: ({ env: e, corsHeaders: ch }) => handleGetVapidPublicKey(e, ch),
        },
        {
          pattern: '/api/universities',
          methods: ['GET'],
          authRequired: false,
          handler: ({ env: e, corsHeaders: ch }) => handleListUniversities(e, ch),
        },
        {
          pattern: /^\/api\/universities\/([a-z0-9_-]+)\/faculties$/i,
          methods: ['GET'],
          authRequired: false,
          handler: ({ params, corsHeaders: ch }) => handleGetFaculties(params[0]!, ch),
        },
        {
          pattern: /^\/api\/universities\/([a-z0-9_-]+)\/groups$/i,
          methods: ['GET'],
          authRequired: false,
          handler: ({ params, url: u, env: e, corsHeaders: ch }) =>
            handleGetGroups(params[0]!, u, e, ch),
        },
        {
          pattern: '/api/schedule',
          methods: ['GET'],
          authRequired: false,
          handler: ({ url: u, env: e, corsHeaders: ch }) => handleGetSchedule(u, e, ch),
        },
        {
          pattern: '/api/auth/register',
          methods: ['POST'],
          authRequired: false,
          handler: ({ request: req, env: e, corsHeaders: ch }) =>
            handleRegisterUser(req, e, ch),
        },
        {
          pattern: '/api/devices',
          methods: ['GET'],
          authRequired: true,
          handler: ({ auth, env: e, corsHeaders: ch }) => handleListDevices(auth!, e, ch),
        },
        // Static /api/devices/link & /api/devices/rotate MUST precede /api/devices/:deviceId
        {
          pattern: '/api/devices/link',
          methods: ['POST'],
          authRequired: true,
          handler: ({ request: req, auth, env: e, corsHeaders: ch }) =>
            handleLinkDevice(req, auth!, e, ch),
        },
        {
          pattern: '/api/devices/rotate',
          methods: ['POST'],
          authRequired: true,
          handler: ({ auth, env: e, corsHeaders: ch }) => handleRotateToken(auth!, e, ch),
        },
        {
          pattern: /^\/api\/devices\/([a-zA-Z0-9-]+)$/,
          methods: ['DELETE'],
          authRequired: true,
          handler: ({ params, auth, env: e, corsHeaders: ch }) =>
            handleRevokeDevice(params[0]!, auth!, e, ch),
        },
        {
          pattern: '/api/profile',
          methods: ['GET', 'PUT'],
          authRequired: true,
          handler: ({ request: req, auth, env: e, corsHeaders: ch }) =>
            req.method === 'GET'
              ? handleGetProfile(auth!, e, ch)
              : handleUpdateProfile(req, auth!, e, ch),
        },
        {
          pattern: '/api/push/subscriptions',
          methods: ['GET', 'POST'],
          authRequired: true,
          handler: ({ request: req, auth, env: e, corsHeaders: ch }) =>
            req.method === 'GET'
              ? handleListPushSubscriptions(auth!, e, ch)
              : handleUpsertPushSubscription(req, auth!, e, ch),
        },
        {
          pattern: /^\/api\/push\/subscriptions\/([a-zA-Z0-9-]+)$/,
          methods: ['DELETE'],
          authRequired: true,
          handler: ({ params, auth, env: e, corsHeaders: ch }) =>
            handleDeletePushSubscription(params[0]!, auth!, e, ch),
        },
        {
          pattern: '/api/notifications/preferences',
          methods: ['GET', 'PUT'],
          authRequired: true,
          handler: ({ request: req, auth, env: e, corsHeaders: ch }) =>
            req.method === 'GET'
              ? handleGetNotificationPreferences(auth!, e, ch)
              : handleUpdateNotificationPreferences(req, auth!, e, ch),
        },
        {
          pattern: '/api/attendance',
          methods: ['GET'],
          authRequired: true,
          handler: ({ url: u, auth, env: e, corsHeaders: ch }) =>
            handleGetAttendance(u, auth!, e, ch),
        },
        {
          pattern: '/api/attendance/sync',
          methods: ['POST'],
          authRequired: true,
          handler: ({ request: req, auth, env: e, corsHeaders: ch }) =>
            handleSyncAttendance(req, auth!, e, ch),
        },
      ];

      let matchedRoute: RouteDef | null = null;
      let matchedParams: string[] = [];
      for (const route of routes) {
        if (typeof route.pattern === 'string') {
          if (path === route.pattern) {
            matchedRoute = route;
            break;
          }
        } else {
          const m = path.match(route.pattern);
          if (m) {
            matchedRoute = route;
            matchedParams = m.slice(1);
            break;
          }
        }
      }

      if (!matchedRoute) {
        return errorResponse('NOT_FOUND', 'Маршрут не знайдено', 404, corsHeaders);
      }

      if (!matchedRoute.methods.includes(request.method as 'GET' | 'POST' | 'PUT' | 'DELETE')) {
        return errorResponse(
          'METHOD_NOT_ALLOWED',
          `Метод ${request.method} не підтримується для ${path}`,
          405,
          corsHeaders,
          { Allow: matchedRoute.methods.join(', ') }
        );
      }

      let auth: Awaited<ReturnType<typeof authenticateRequest>> = null;
      if (matchedRoute.authRequired) {
        auth = await authenticateRequest(request, env);
        if (!auth) {
          return errorResponse(
            'UNAUTHORIZED',
            'Потрібен дійсний syncToken у заголовку Authorization: Bearer',
            401,
            corsHeaders
          );
        }
      }

      return await matchedRoute.handler({
        request,
        url,
        env,
        corsHeaders,
        params: matchedParams,
        auth,
      });
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
