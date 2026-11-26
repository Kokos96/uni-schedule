import {
  RELEASES_CATALOG,
  buildReleaseNotificationPayload,
  compareSemver,
  isValidSemver,
  type ReleaseEntry,
} from '../../../../src/data/releases';
import { sendWebPushOnce, type VapidConfig } from '../push/webPush';
import { errorResponse, jsonResponse, parseJsonBody } from '../security';
import type { Env } from '../types';

const MAX_RELEASE_DISPATCH_BATCH = 50;
const MAX_RELEASE_RETRY_ATTEMPTS = 3;
/** Retry backoff schedule in seconds for confirmed transient HTTP 429/5xx failures. */
const RETRY_BACKOFF_SECONDS = [60, 300] as const;

interface DbReleaseRow {
  id: string;
  version: string;
  publication_status: 'draft' | 'published';
  published_at: string | null;
  eligibility_cutoff_at?: string | null;
  github_release_url: string | null;
  updated_at: string;
}

interface EligibleRecipientRow {
  user_id: string;
  sub_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  delivery_status: string | null;
  attempt_count: number | null;
}

/** Constant-time string comparison for admin token verification. */
function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function authorizeReleaseAdmin(
  request: Request,
  env: Env
): { ok: true } | { ok: false; status: number; code: string; message: string } {
  const expected = env.RELEASE_ADMIN_TOKEN?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 503,
      code: 'ADMIN_DISABLED',
      message: 'Механізм публікації релізів не активовано на сервері',
    };
  }
  const authHeader = request.headers.get('Authorization') ?? '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const supplied = match?.[1]?.trim() ?? '';
  if (!supplied || !timingSafeEqualString(supplied, expected)) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHORIZED',
      message: 'Недостатньо прав для керування релізами',
    };
  }
  return { ok: true };
}

/**
 * Merges canonical `RELEASES_CATALOG` with runtime publication overrides in D1 `releases`.
 * Draft entries remain hidden unless explicitly published in D1 (or canonical catalog).
 */
export async function resolveMergedReleases(
  env: Env,
  options: { includeDraft?: boolean } = {}
): Promise<Array<ReleaseEntry & { eligibilityCutoffAt?: string | null }>> {
  const dbRowsByVersion = new Map<string, DbReleaseRow>();
  try {
    const res = await env.DB.prepare(
      `SELECT id, version, publication_status, published_at, eligibility_cutoff_at, github_release_url, updated_at
       FROM releases`
    ).all<DbReleaseRow>();
    for (const row of res.results ?? []) {
      dbRowsByVersion.set(row.version, row);
    }
  } catch {
    // Graceful degradation if table is not yet migrated (rollback / pre-0010 compatibility)
  }

  const merged: Array<ReleaseEntry & { eligibilityCutoffAt?: string | null }> = RELEASES_CATALOG.map((entry) => {
    const override = dbRowsByVersion.get(entry.version);
    if (!override) return entry;
    return {
      ...entry,
      publicationStatus: override.publication_status,
      publishedAt: override.publication_status === 'draft' ? null : (override.published_at ?? entry.publishedAt),
      eligibilityCutoffAt: override.eligibility_cutoff_at ?? override.updated_at,
      githubReleaseUrl: override.github_release_url ?? entry.githubReleaseUrl,
    };
  });

  const filtered = options.includeDraft
    ? merged
    : merged.filter((r) => r.publicationStatus === 'published');
  return filtered.sort((a, b) => compareSemver(b.version, a.version));
}

export async function handleListReleases(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const releases = (await resolveMergedReleases(env, { includeDraft: false })).map(
    ({ eligibilityCutoffAt: _cutoff, ...rest }) => rest
  );
  return jsonResponse(
    { releases },
    200,
    corsHeaders,
    { 'Cache-Control': 'public, max-age=300' }
  );
}

export async function handleGetLatestRelease(
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const releases = (await resolveMergedReleases(env, { includeDraft: false })).map(
    ({ eligibilityCutoffAt: _cutoff, ...rest }) => rest
  );
  const latest = releases[0] ?? null;
  if (!latest) {
    return errorResponse('NOT_FOUND', 'Опублікованих релізів не знайдено', 404, corsHeaders);
  }
  return jsonResponse(
    { release: latest },
    200,
    corsHeaders,
    { 'Cache-Control': 'public, max-age=300' }
  );
}

export async function handleGetReleaseByVersion(
  rawVersion: string,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const clean = decodeURIComponent(rawVersion).trim().replace(/^v/i, '');
  if (!isValidSemver(clean)) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний формат версії (очікується X.Y.Z)', 400, corsHeaders);
  }
  const releases = (await resolveMergedReleases(env, { includeDraft: false })).map(
    ({ eligibilityCutoffAt: _cutoff, ...rest }) => rest
  );
  const found = releases.find((r) => r.version === clean);
  if (!found) {
    return errorResponse('NOT_FOUND', `Реліз v${clean} не знайдено`, 404, corsHeaders);
  }
  return jsonResponse(
    { release: found },
    200,
    corsHeaders,
    { 'Cache-Control': 'public, max-age=300' }
  );
}

export async function handleAdminPublishRelease(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const auth = authorizeReleaseAdmin(request, env);
  if (!auth.ok) {
    return errorResponse(auth.code, auth.message, auth.status, corsHeaders);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const version = typeof parsed.data.version === 'string' ? parsed.data.version.trim().replace(/^v/i, '') : '';
  if (!isValidSemver(version)) {
    return errorResponse('VALIDATION_ERROR', 'Некоректна версія релізу', 400, corsHeaders);
  }
  const canonical = RELEASES_CATALOG.find((r) => r.version === version);
  if (!canonical) {
    return errorResponse('NOT_FOUND', `Реліз v${version} відсутній у канонічному каталозі`, 404, corsHeaders);
  }

  const rawStatus = parsed.data.publicationStatus;
  if (rawStatus !== undefined && rawStatus !== 'published' && rawStatus !== 'draft') {
    return errorResponse('VALIDATION_ERROR', 'publicationStatus має бути published або draft', 400, corsHeaders);
  }
  const targetStatus: 'published' | 'draft' = rawStatus === 'draft' ? 'draft' : 'published';

  const now = new Date().toISOString();
  const publishedAt =
    targetStatus === 'draft'
      ? null
      : typeof parsed.data.publishedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.data.publishedAt)
        ? parsed.data.publishedAt
        : now.slice(0, 10);
  const eligibilityCutoffAt =
    targetStatus === 'draft'
      ? null
      : typeof parsed.data.eligibilityCutoffAt === 'string' && !Number.isNaN(Date.parse(parsed.data.eligibilityCutoffAt))
        ? new Date(parsed.data.eligibilityCutoffAt).toISOString()
        : now;
  const githubReleaseUrl =
    typeof parsed.data.githubReleaseUrl === 'string' && parsed.data.githubReleaseUrl.startsWith('https://github.com/')
      ? parsed.data.githubReleaseUrl.trim()
      : (canonical.githubReleaseUrl ?? null);

  await env.DB.prepare(
    `INSERT INTO releases (id, version, publication_status, published_at, eligibility_cutoff_at, github_release_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       publication_status = excluded.publication_status,
       published_at = excluded.published_at,
       eligibility_cutoff_at = COALESCE(releases.eligibility_cutoff_at, excluded.eligibility_cutoff_at),
       github_release_url = COALESCE(excluded.github_release_url, releases.github_release_url),
       updated_at = excluded.updated_at`
  )
    .bind(canonical.id, canonical.version, targetStatus, publishedAt, eligibilityCutoffAt, githubReleaseUrl, now)
    .run();

  return jsonResponse(
    {
      published: targetStatus === 'published',
      release: {
        ...canonical,
        publicationStatus: targetStatus,
        publishedAt,
        ...(githubReleaseUrl ? { githubReleaseUrl } : {}),
      },
    },
    200,
    corsHeaders,
    { 'Cache-Control': 'no-store' }
  );
}

/**
 * Protected, idempotent release notification dispatcher with atomic claim locking,
 * explicit live confirmation, retry backoff, multi-device failover, consent timestamp cutoff,
 * and zero-mutation `dryRun`.
 *
 * Delivery semantics:
 * - Atomic claim on `(release_id, user_id)` prevents concurrent workers/dispatches from sending duplicates.
 *   This is an at-most-once concurrent claim (not an absolute single-external-call guarantee across the entire
 *   lifecycle, because bounded retries after confirmed HTTP 429/5xx failures and multi-device failover after
 *   HTTP 404/410 are intentionally permitted).
 * - Eligibility checks both subscription creation and actual consent timestamp (`release_updates_enabled_at <= cutoff`).
 * - Confirmed transient provider failures (HTTP 429 / 5xx) transition to `failed` with `next_retry_at` backoff (`< 3` attempts).
 * - Network timeouts / aborted requests (`status === 0`) transition to `unknown` and are NEVER auto-retried
 *   to avoid duplicate notifications when provider acceptance is uncertain.
 * - `pending` rows left by an abruptly terminated Worker are never auto-reclaimed as `failed` and remain
 *   inspectable in `release_notification_deliveries` for operator diagnostics.
 * - HTTP 404/410 deactivates the expired subscription (`fail_count = 10`) and safely tries the user's next
 *   active subscription within the same claim; marks `expired` only if no active subscription remains.
 */
export async function handleAdminDispatchReleasePush(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const auth = authorizeReleaseAdmin(request, env);
  if (!auth.ok) {
    return errorResponse(auth.code, auth.message, auth.status, corsHeaders);
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const version = typeof parsed.data.version === 'string' ? parsed.data.version.trim().replace(/^v/i, '') : '';
  if (!isValidSemver(version)) {
    return errorResponse('VALIDATION_ERROR', 'Некоректна версія релізу', 400, corsHeaders);
  }

  const dryRun = parsed.data.dryRun !== false; // Safe default: dryRun = true unless explicitly false
  const confirmLive = parsed.data.confirmLive === true;
  if (!dryRun && !confirmLive) {
    return errorResponse(
      'CONFIRMATION_REQUIRED',
      'Для live-розсилки потрібне явне підтвердження confirmLive: true',
      400,
      corsHeaders
    );
  }

  const rawBatchInput = parsed.data.batchSize ?? parsed.data.batchLimit;
  let batchSize = MAX_RELEASE_DISPATCH_BATCH;
  if (rawBatchInput !== undefined) {
    if (
      typeof rawBatchInput !== 'number' ||
      !Number.isInteger(rawBatchInput) ||
      rawBatchInput < 1 ||
      rawBatchInput > MAX_RELEASE_DISPATCH_BATCH
    ) {
      return errorResponse(
        'VALIDATION_ERROR',
        `batchSize має бути цілим числом від 1 до ${MAX_RELEASE_DISPATCH_BATCH}`,
        400,
        corsHeaders
      );
    }
    batchSize = rawBatchInput;
  }

  const allReleases = await resolveMergedReleases(env, { includeDraft: true });
  const release = allReleases.find((r) => r.version === version);
  if (!release) {
    return errorResponse('NOT_FOUND', `Реліз v${version} не знайдено`, 404, corsHeaders);
  }

  if (!dryRun && release.publicationStatus !== 'published') {
    return errorResponse(
      'RELEASE_NOT_PUBLISHED',
      `Реліз v${version} ще має статус draft. Спочатку опублікуйте реліз.`,
      409,
      corsHeaders
    );
  }

  const payload = buildReleaseNotificationPayload(release);
  const nowIso = new Date().toISOString();
  const cutoffIso =
    release.eligibilityCutoffAt ??
    (release.publishedAt ? `${release.publishedAt}T23:59:59.999Z` : nowIso);

  const countsRow = await env.DB.prepare(
    `SELECT
       (SELECT COUNT(DISTINCT ps.user_id)
        FROM push_subscriptions ps
        JOIN user_devices ud ON ud.id = ps.device_id AND ud.revoked_at IS NULL
        WHERE ps.fail_count < 10) AS total_subscribed_users,
       (SELECT COUNT(*)
        FROM release_notification_deliveries
        WHERE release_id = ? AND status = 'sent') AS already_sent,
       (SELECT COUNT(*)
        FROM release_notification_deliveries
        WHERE release_id = ? AND status IN ('expired', 'skipped', 'unknown', 'pending')) AS already_terminal`
  )
    .bind(release.id, release.id)
    .first<{ total_subscribed_users: number; already_sent: number; already_terminal: number }>();

  // Select opted-in users with active devices, subscription, and actual consent on/before release cutoff
  const candidatesRes = await env.DB.prepare(
    `SELECT ps.user_id, ps.id AS sub_id, ps.endpoint, ps.p256dh, ps.auth,
            rnd.status AS delivery_status, rnd.attempt_count
     FROM push_subscriptions ps
     JOIN user_devices ud ON ud.id = ps.device_id AND ud.revoked_at IS NULL
     JOIN notification_preferences np
       ON np.user_id = ps.user_id AND np.enabled = 1 AND np.release_updates_enabled = 1
     LEFT JOIN release_notification_deliveries rnd
       ON rnd.release_id = ? AND rnd.user_id = ps.user_id
     WHERE ps.fail_count < 10
       AND ps.created_at <= ?
       AND COALESCE(np.release_updates_enabled_at, np.updated_at) <= ?
       AND (
         rnd.status IS NULL
         OR (
           rnd.status = 'failed'
           AND rnd.attempt_count < ?
           AND (rnd.next_retry_at IS NULL OR rnd.next_retry_at <= ?)
         )
       )
     ORDER BY ps.user_id ASC, COALESCE(ps.last_success_at, ps.created_at) DESC, ps.id ASC`
  )
    .bind(release.id, cutoffIso, cutoffIso, MAX_RELEASE_RETRY_ATTEMPTS, nowIso)
    .all<EligibleRecipientRow>();

  // Group active subscriptions per user (ordered best-first) so we can safely fail over on 404/410
  const subsByUser = new Map<string, EligibleRecipientRow[]>();
  for (const row of candidatesRes.results ?? []) {
    const list = subsByUser.get(row.user_id);
    if (list) {
      list.push(row);
    } else {
      subsByUser.set(row.user_id, [row]);
    }
  }

  const eligibleUsers = Array.from(subsByUser.values());
  const totalSubscribedUsers = countsRow?.total_subscribed_users ?? 0;
  const alreadyProcessed = (countsRow?.already_sent ?? 0) + (countsRow?.already_terminal ?? 0);
  const eligibleCount = eligibleUsers.length;
  const excludedCount = Math.max(0, totalSubscribedUsers - eligibleCount - alreadyProcessed);

  if (dryRun) {
    return jsonResponse(
      {
        dryRun: true,
        version: release.version,
        releaseId: release.id,
        publicationStatus: release.publicationStatus,
        eligibilityCutoffAt: cutoffIso,
        eligibleRecipients: eligibleCount,
        excludedRecipients: excludedCount,
        alreadyProcessed,
        batchSize,
        payload,
      },
      200,
      corsHeaders,
      { 'Cache-Control': 'no-store' }
    );
  }

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return errorResponse('VAPID_NOT_CONFIGURED', 'VAPID ключі не налаштовані', 503, corsHeaders);
  }

  const vapid: VapidConfig = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@uni-schedule.app',
  };

  const batch = eligibleUsers.slice(0, batchSize);
  let sent = 0;
  let failed = 0;
  let expired = 0;
  let unknown = 0;
  let skippedConcurrent = 0;

  for (const userSubs of batch) {
    const primary = userSubs[0]!;
    const claimNow = new Date().toISOString();
    const isRetry = primary.delivery_status === 'failed';
    const nextAttempt = (primary.attempt_count ?? 0) + 1;

    // Atomic reservation + live consent & cutoff re-verification right before any external push call
    let claimed = false;
    if (!isRetry) {
      const reserveRes = await env.DB.prepare(
        `INSERT OR IGNORE INTO release_notification_deliveries (
           release_id, user_id, subscription_id, status, attempt_count, next_retry_at, created_at, updated_at
         )
         SELECT ?, ?, ?, 'pending', 1, NULL, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM notification_preferences np
           WHERE np.user_id = ?
             AND np.enabled = 1
             AND np.release_updates_enabled = 1
             AND COALESCE(np.release_updates_enabled_at, np.updated_at) <= ?
         )`
      )
        .bind(release.id, primary.user_id, primary.sub_id, claimNow, claimNow, primary.user_id, cutoffIso)
        .run();
      claimed = (reserveRes.meta.changes ?? 0) > 0;
    } else {
      const retryRes = await env.DB.prepare(
        `UPDATE release_notification_deliveries
         SET status = 'pending', subscription_id = ?, attempt_count = attempt_count + 1, next_retry_at = NULL, updated_at = ?
         WHERE release_id = ?
           AND user_id = ?
           AND status = 'failed'
           AND attempt_count < ?
           AND (next_retry_at IS NULL OR next_retry_at <= ?)
           AND EXISTS (
             SELECT 1 FROM notification_preferences np
             WHERE np.user_id = ?
               AND np.enabled = 1
               AND np.release_updates_enabled = 1
               AND COALESCE(np.release_updates_enabled_at, np.updated_at) <= ?
           )`
      )
        .bind(
          primary.sub_id,
          claimNow,
          release.id,
          primary.user_id,
          MAX_RELEASE_RETRY_ATTEMPTS,
          claimNow,
          primary.user_id,
          cutoffIso
        )
        .run();
      claimed = (retryRes.meta.changes ?? 0) > 0;
    }

    if (!claimed) {
      skippedConcurrent += 1;
      continue;
    }

    // Attempt delivery; if primary subscription returns 404/410, deactivate it and safely fail over
    // to another active subscription of the same user without ever duplicating a sent/unknown push.
    let finalOutcome: 'sent' | 'expired' | 'failed' | 'unknown' = 'expired';
    let finalSubId = primary.sub_id;
    let finalError = 'HTTP 410';
    let finalRetryable = false;

    for (const sub of userSubs) {
      finalSubId = sub.sub_id;
      const pushResult = await sendWebPushOnce(
        {
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
        },
        {
          title: payload.title,
          body: payload.body,
          tag: payload.tag,
          url: payload.url,
          ttlSeconds: 86400,
          urgency: 'normal',
          actions: [{ action: 'open-release', title: 'Що нового?' }],
        },
        vapid
      );

      if (pushResult.ok) {
        finalOutcome = 'sent';
        break;
      }

      if (pushResult.expired) {
        finalError = `HTTP ${pushResult.status}`;
        await env.DB.prepare(`UPDATE push_subscriptions SET fail_count = 10 WHERE id = ?`)
          .bind(sub.sub_id)
          .run();
        // Continue loop to try next active subscription for this user, if any
        continue;
      }

      if (pushResult.status === 0) {
        // Network timeout / abort: delivery outcome is uncertain — NEVER auto-retry
        finalOutcome = 'unknown';
        finalError = pushResult.errorMessage ?? 'NETWORK_UNKNOWN';
        break;
      }

      finalOutcome = 'failed';
      finalError = `HTTP ${pushResult.status}`;
      finalRetryable = pushResult.retryable;
      break;
    }

    const doneAt = new Date().toISOString();
    if (finalOutcome === 'sent') {
      sent += 1;
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE release_notification_deliveries
           SET status = 'sent', subscription_id = ?, last_error = NULL, next_retry_at = NULL, updated_at = ?
           WHERE release_id = ? AND user_id = ?`
        ).bind(finalSubId, doneAt, release.id, primary.user_id),
        env.DB.prepare(
          `UPDATE push_subscriptions SET last_success_at = ?, fail_count = 0 WHERE id = ?`
        ).bind(doneAt, finalSubId),
      ]);
    } else if (finalOutcome === 'expired') {
      expired += 1;
      await env.DB.prepare(
        `UPDATE release_notification_deliveries
         SET status = 'expired', subscription_id = ?, last_error = ?, next_retry_at = NULL, updated_at = ?
         WHERE release_id = ? AND user_id = ?`
      )
        .bind(finalSubId, finalError, doneAt, release.id, primary.user_id)
        .run();
    } else if (finalOutcome === 'unknown') {
      unknown += 1;
      await env.DB.prepare(
        `UPDATE release_notification_deliveries
         SET status = 'unknown', subscription_id = ?, last_error = ?, next_retry_at = NULL, updated_at = ?
         WHERE release_id = ? AND user_id = ?`
      )
        .bind(finalSubId, finalError, doneAt, release.id, primary.user_id)
        .run();
    } else {
      failed += 1;
      const canRetryAgain = finalRetryable && nextAttempt < MAX_RELEASE_RETRY_ATTEMPTS;
      const backoffSec = RETRY_BACKOFF_SECONDS[Math.min(nextAttempt - 1, RETRY_BACKOFF_SECONDS.length - 1)] ?? 300;
      const nextRetryAt = canRetryAgain ? new Date(Date.now() + backoffSec * 1000).toISOString() : null;
      const storedAttempt = finalRetryable ? nextAttempt : MAX_RELEASE_RETRY_ATTEMPTS;
      await env.DB.prepare(
        `UPDATE release_notification_deliveries
         SET status = 'failed', subscription_id = ?, attempt_count = ?, next_retry_at = ?, last_error = ?, updated_at = ?
         WHERE release_id = ? AND user_id = ?`
      )
        .bind(finalSubId, storedAttempt, nextRetryAt, finalError, doneAt, release.id, primary.user_id)
        .run();
    }
  }

  return jsonResponse(
    {
      dryRun: false,
      version: release.version,
      releaseId: release.id,
      batchProcessed: batch.length,
      remainingEligible: Math.max(0, eligibleCount - batch.length),
      sent,
      failed,
      expired,
      unknown,
      skippedConcurrent,
    },
    200,
    corsHeaders,
    { 'Cache-Control': 'no-store' }
  );
}
