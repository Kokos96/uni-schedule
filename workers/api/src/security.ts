import type { AuthContext, Env } from './types';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'https://uni-schedule.vercel.app',
];

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = '';
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Generates a 256-bit cryptographically random syncToken (never stored raw in D1).
 */
export function generateSyncToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `ust_${toBase64Url(bytes)}`;
}

export function resolveTokenPepper(env: Env): string {
  const pepper = env.TOKEN_PEPPER?.trim() ?? '';
  if (env.REQUIRE_TOKEN_PEPPER === 'true' && pepper.length < 16) {
    throw new Error('TOKEN_PEPPER is required when REQUIRE_TOKEN_PEPPER=true');
  }
  return pepper;
}

/**
 * Computes SHA-256 hex digest of a syncToken (optionally peppered with TOKEN_PEPPER).
 */
export async function hashSyncToken(
  rawToken: string,
  pepper: string = ''
): Promise<string> {
  const payload = new TextEncoder().encode(`${pepper}:${rawToken}`);
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return toHex(digest);
}

export function getAllowedOrigins(env: Env): string[] {
  const raw = env.ALLOWED_ORIGINS?.trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function resolveCorsHeaders(
  request: Request,
  env: Env
): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowed = getAllowedOrigins(env);
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };

  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
  }

  return headers;
}

export function isOriginAllowed(request: Request, env: Env): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return true; // Non-browser / curl / server-to-server requests
  return getAllowedOrigins(env).includes(origin);
}

export function jsonResponse(
  data: unknown,
  status: number = 200,
  corsHeaders: Record<string, string> = {},
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
      ...corsHeaders,
      ...extraHeaders,
    },
  });
}

export function errorResponse(
  code: string,
  message: string,
  status: number,
  corsHeaders: Record<string, string> = {},
  extraHeaders: Record<string, string> = {}
): Response {
  return jsonResponse({ error: { code, message } }, status, corsHeaders, extraHeaders);
}

export async function parseJsonBody<T = Record<string, unknown>>(
  request: Request,
  maxBytes: number = 16384
): Promise<{ ok: true; data: T } | { ok: false; message: string }> {
  const contentLength = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return { ok: false, message: 'Розмір запиту перевищує допустимий ліміт' };
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, message: 'Не вдалося прочитати тіло запиту' };
  }

  if (text.length > maxBytes) {
    return { ok: false, message: 'Розмір запиту перевищує допустимий ліміт' };
  }

  if (!text.trim()) {
    return { ok: true, data: {} as T };
  }

  try {
    const parsed = JSON.parse(text) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, message: 'Очікується JSON-об’єкт' };
    }
    return { ok: true, data: parsed as T };
  } catch {
    return { ok: false, message: 'Некоректний JSON у тілі запиту' };
  }
}

export async function authenticateRequest(
  request: Request,
  env: Env
): Promise<AuthContext | null> {
  const authHeader = request.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (token.length < 16 || token.length > 256) {
    return null;
  }

  const tokenHash = await hashSyncToken(token, resolveTokenPepper(env));
  const row = await env.DB.prepare(
    `SELECT id, user_id, revoked_at
     FROM user_devices
     WHERE token_hash = ?
     LIMIT 1`
  )
    .bind(tokenHash)
    .first<{ id: string; user_id: string; revoked_at: string | null }>();

  if (!row || row.revoked_at !== null) {
    return null;
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `UPDATE user_devices SET last_seen_at = ? WHERE id = ?`
  )
    .bind(now, row.id)
    .run();

  return {
    userId: row.user_id,
    deviceId: row.id,
  };
}

export async function checkRateLimit(
  db: D1Database,
  bucketKey: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const nowSec = Math.floor(Date.now() / 1000);
  const existing = await db
    .prepare(`SELECT count, reset_at FROM rate_limit_buckets WHERE bucket_key = ?`)
    .bind(bucketKey)
    .first<{ count: number; reset_at: number }>();

  if (!existing || existing.reset_at <= nowSec) {
    const resetAt = nowSec + windowSeconds;
    await db
      .prepare(
        `INSERT INTO rate_limit_buckets (bucket_key, count, reset_at)
         VALUES (?, 1, ?)
         ON CONFLICT(bucket_key) DO UPDATE SET count = 1, reset_at = excluded.reset_at`
      )
      .bind(bucketKey, resetAt)
      .run();
    return { allowed: true, remaining: Math.max(0, maxRequests - 1), resetAt };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.reset_at };
  }

  const nextCount = existing.count + 1;
  await db
    .prepare(`UPDATE rate_limit_buckets SET count = ? WHERE bucket_key = ?`)
    .bind(nextCount, bucketKey)
    .run();

  return {
    allowed: true,
    remaining: Math.max(0, maxRequests - nextCount),
    resetAt: existing.reset_at,
  };
}

export function getClientIdentifier(request: Request): string {
  return (
    request.headers.get('CF-Connecting-IP') ??
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'local'
  );
}
