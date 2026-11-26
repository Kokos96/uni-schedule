import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import { bytesToBase64Url } from '../src/push/webPush';
import { hashSyncToken, resolveTokenPepper } from '../src/security';
import worker from '../src/index';
import type { Env } from '../src/types';

async function makeVapid() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as { d: string };
  const pubRaw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const b64uToBytes = (s: string) => {
    const pad = s + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  return { publicKey: bytesToBase64Url(pubRaw), privateKey: bytesToBase64Url(b64uToBytes(jwk.d)) };
}

async function makeSubKeys() {
  const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const pubRaw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const auth = new Uint8Array(16);
  crypto.getRandomValues(auth);
  return { p256dh: bytesToBase64Url(pubRaw), auth: bytesToBase64Url(auth) };
}

class MockReleaseD1 {
  public releases = new Map<string, Record<string, unknown>>();
  public deliveries = new Map<string, Record<string, unknown>>();
  public subs: Array<Record<string, unknown>> = [];
  public prefs = new Map<string, Record<string, unknown>>();
  public devices = new Map<string, { id: string; user_id: string; token_hash: string; revoked_at: string | null }>();
  public academicDeliveries = new Map<string, Record<string, unknown>>();
  public onBeforeClaim?: (userId: string) => void;

  prepare(sql: string): D1PreparedStatement {
    const db = this;
    const bound: unknown[] = [];
    const stmt = {
      bind(...vals: unknown[]) {
        bound.push(...vals);
        return stmt;
      },
      async first<T = unknown>(): Promise<T | null> {
        const res = await stmt.all<T>();
        return res.results[0] ?? null;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const norm = sql.replace(/\s+/g, ' ').trim();
        let results: unknown[] = [];
        if (norm.startsWith('INSERT INTO rate_limit_buckets') && norm.includes('RETURNING')) {
          results = [{ count: 1, reset_at: Math.floor(Date.now() / 1000) + 60 }];
        } else if (norm.startsWith('SELECT id, version, publication_status')) {
          results = Array.from(db.releases.values());
        } else if (norm.startsWith('SELECT id, user_id, revoked_at FROM user_devices')) {
          const hash = bound[0] as string;
          const found = Array.from(db.devices.values()).find((d) => d.token_hash === hash);
          results = found ? [found] : [];
        } else if (norm.startsWith('SELECT user_id, enabled, morning_enabled')) {
          const userId = bound[0] as string;
          const p = db.prefs.get(userId);
          results = p ? [p] : [];
        } else if (norm.includes('total_subscribed_users')) {
          const releaseId = bound[0] as string;
          const totalUsers = new Set(db.subs.filter((s) => (s.fail_count as number) < 10).map((s) => s.user_id)).size;
          const alreadySent = Array.from(db.deliveries.values()).filter((d) => d.release_id === releaseId && d.status === 'sent').length;
          const alreadyTerminal = Array.from(db.deliveries.values()).filter(
            (d) =>
              d.release_id === releaseId &&
              (d.status === 'expired' || d.status === 'skipped' || d.status === 'unknown' || d.status === 'pending')
          ).length;
          results = [{ total_subscribed_users: totalUsers, already_sent: alreadySent, already_terminal: alreadyTerminal }];
        } else if (norm.startsWith('SELECT ps.user_id, ps.id AS sub_id')) {
          const releaseId = bound[0] as string;
          const cutoffIso = bound[1] as string;
          const consentCutoffIso = bound[2] as string;
          const maxAttempts = bound[3] as number;
          const nowIso = bound[4] as string;
          results = db.subs
            .filter((s) => {
              if ((s.fail_count as number) >= 10) return false;
              const createdAt = (s.created_at as string | undefined) ?? '2026-01-01T00:00:00.000Z';
              if (createdAt > cutoffIso) return false;
              const pref = db.prefs.get(s.user_id as string);
              if (!pref || pref.enabled !== 1 || pref.release_updates_enabled !== 1) return false;
              const consentAt = (pref.release_updates_enabled_at as string | null | undefined) ?? (pref.updated_at as string | undefined) ?? '2026-01-01T00:00:00.000Z';
              if (consentAt > consentCutoffIso) return false;
              const deliv = db.deliveries.get(`${releaseId}:${s.user_id}`);
              if (!deliv) return true;
              if (deliv.status !== 'failed') return false;
              if ((deliv.attempt_count as number) >= maxAttempts) return false;
              if (deliv.next_retry_at && (deliv.next_retry_at as string) > nowIso) return false;
              return true;
            })
            .sort((a, b) => {
              const uCmp = String(a.user_id).localeCompare(String(b.user_id));
              if (uCmp !== 0) return uCmp;
              const ta = String(a.last_success_at ?? a.created_at ?? '2026-01-01T00:00:00.000Z');
              const tb = String(b.last_success_at ?? b.created_at ?? '2026-01-01T00:00:00.000Z');
              if (ta !== tb) return tb.localeCompare(ta);
              return String(a.id).localeCompare(String(b.id));
            })
            .map((s) => {
              const deliv = db.deliveries.get(`${releaseId}:${s.user_id}`);
              return {
                user_id: s.user_id,
                sub_id: s.id,
                endpoint: s.endpoint,
                p256dh: s.p256dh,
                auth: s.auth,
                delivery_status: deliv?.status ?? null,
                attempt_count: deliv?.attempt_count ?? null,
              };
            });
        }
        return {
          results: results as T[],
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, served_by: 'mock', rows_read: results.length, rows_written: 0, changed_db: false, size_after: 0 },
        };
      },
      async run(): Promise<D1Result<unknown>> {
        const norm = sql.replace(/\s+/g, ' ').trim();
        let changes = 0;
        if (norm.startsWith('INSERT INTO releases')) {
          const [id, version, publication_status, published_at, eligibility_cutoff_at, github_release_url, updated_at] = bound;
          const prev = db.releases.get(id as string);
          db.releases.set(id as string, {
            id,
            version,
            publication_status,
            published_at,
            eligibility_cutoff_at: prev?.eligibility_cutoff_at ?? eligibility_cutoff_at,
            github_release_url: github_release_url ?? prev?.github_release_url ?? null,
            updated_at,
          });
          changes = 1;
        } else if (norm.startsWith('INSERT INTO notification_preferences')) {
          const [
            user_id, enabled, morning_enabled, morning_time,
            before_lesson_enabled, before_lesson_minutes,
            before_end_enabled, before_end_minutes,
            evening_enabled, evening_time,
            friday_enabled, friday_time, schedule_change_enabled,
            release_updates_enabled, release_updates_enabled_at, updated_at,
          ] = bound;
          db.prefs.set(user_id as string, {
            user_id, enabled, morning_enabled, morning_time,
            before_lesson_enabled, before_lesson_minutes,
            before_end_enabled, before_end_minutes,
            evening_enabled, evening_time,
            friday_enabled, friday_time, schedule_change_enabled,
            release_updates_enabled, release_updates_enabled_at, updated_at,
          });
          changes = 1;
        } else if (norm.startsWith('INSERT OR IGNORE INTO release_notification_deliveries')) {
          const [release_id, user_id, subscription_id, created_at, updated_at, _uid, cutoffIso] = bound;
          if (db.onBeforeClaim) db.onBeforeClaim(user_id as string);
          const pref = db.prefs.get(user_id as string);
          const consentAt = (pref?.release_updates_enabled_at as string | null | undefined) ?? (pref?.updated_at as string | undefined) ?? '2026-01-01T00:00:00.000Z';
          const key = `${release_id}:${user_id}`;
          if (
            pref &&
            pref.enabled === 1 &&
            pref.release_updates_enabled === 1 &&
            consentAt <= (cutoffIso as string) &&
            !db.deliveries.has(key)
          ) {
            db.deliveries.set(key, {
              release_id,
              user_id,
              subscription_id,
              status: 'pending',
              attempt_count: 1,
              next_retry_at: null,
              last_error: null,
              created_at,
              updated_at,
            });
            changes = 1;
          }
        } else if (norm.startsWith("UPDATE release_notification_deliveries SET status = 'pending'")) {
          const [subscription_id, updated_at, release_id, user_id, maxAttempts, claimNow, _uid, cutoffIso] = bound;
          if (db.onBeforeClaim) db.onBeforeClaim(user_id as string);
          const pref = db.prefs.get(user_id as string);
          const consentAt = (pref?.release_updates_enabled_at as string | null | undefined) ?? (pref?.updated_at as string | undefined) ?? '2026-01-01T00:00:00.000Z';
          const d = db.deliveries.get(`${release_id}:${user_id}`);
          if (
            pref &&
            pref.enabled === 1 &&
            pref.release_updates_enabled === 1 &&
            consentAt <= (cutoffIso as string) &&
            d &&
            d.status === 'failed' &&
            (d.attempt_count as number) < (maxAttempts as number) &&
            (!d.next_retry_at || (d.next_retry_at as string) <= (claimNow as string))
          ) {
            d.status = 'pending';
            d.subscription_id = subscription_id;
            d.attempt_count = (d.attempt_count as number) + 1;
            d.next_retry_at = null;
            d.updated_at = updated_at;
            changes = 1;
          }
        } else if (norm.startsWith("UPDATE release_notification_deliveries SET status = 'sent'")) {
          const [subscription_id, updated_at, release_id, user_id] = bound;
          const d = db.deliveries.get(`${release_id}:${user_id}`);
          if (d) { d.status = 'sent'; d.subscription_id = subscription_id; d.last_error = null; d.next_retry_at = null; d.updated_at = updated_at; changes = 1; }
        } else if (norm.startsWith("UPDATE release_notification_deliveries SET status = 'expired'")) {
          const [subscription_id, last_error, updated_at, release_id, user_id] = bound;
          const d = db.deliveries.get(`${release_id}:${user_id}`);
          if (d) { d.status = 'expired'; d.subscription_id = subscription_id; d.last_error = last_error; d.next_retry_at = null; d.updated_at = updated_at; changes = 1; }
        } else if (norm.startsWith("UPDATE release_notification_deliveries SET status = 'unknown'")) {
          const [subscription_id, last_error, updated_at, release_id, user_id] = bound;
          const d = db.deliveries.get(`${release_id}:${user_id}`);
          if (d) { d.status = 'unknown'; d.subscription_id = subscription_id; d.last_error = last_error; d.next_retry_at = null; d.updated_at = updated_at; changes = 1; }
        } else if (norm.startsWith("UPDATE release_notification_deliveries SET status = 'failed'")) {
          const [subscription_id, attempt_count, next_retry_at, last_error, updated_at, release_id, user_id] = bound;
          const d = db.deliveries.get(`${release_id}:${user_id}`);
          if (d) { d.status = 'failed'; d.subscription_id = subscription_id; d.attempt_count = attempt_count; d.next_retry_at = next_retry_at; d.last_error = last_error; d.updated_at = updated_at; changes = 1; }
        } else if (norm.startsWith('UPDATE push_subscriptions SET fail_count = 10')) {
          const sub = db.subs.find((s) => s.id === bound[0]);
          if (sub) { sub.fail_count = 10; changes = 1; }
        } else if (norm.startsWith('UPDATE push_subscriptions SET last_success_at')) {
          const sub = db.subs.find((s) => s.id === bound[1]);
          if (sub) { sub.last_success_at = bound[0]; sub.fail_count = 0; changes = 1; }
        }
        return {
          results: [],
          success: true,
          meta: { duration: 0, changes, last_row_id: 0, served_by: 'mock', rows_read: 0, rows_written: changes, changed_db: changes > 0, size_after: 0 },
        };
      },
      async raw() { return []; },
    } as unknown as D1PreparedStatement;
    return stmt;
  }
  async batch(stmts: D1PreparedStatement[]) {
    const out = [];
    for (const s of stmts) out.push(await s.run());
    return out;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('workers/api v4.3.0 Release Communication, Concurrency & Quality Gate', () => {
  it('enforces admin endpoint safety: 503 disabled, 401 bad/missing auth, 400 malformed/excessive batch/missing confirmLive, 404 unknown, rollback to draft', async () => {
    const db = new MockReleaseD1();
    const envNoToken = { DB: db as unknown as D1Database } as unknown as Env;

    // 1. Missing RELEASE_ADMIN_TOKEN -> 503 fail-closed
    const r503 = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '4.3.0' }),
      }),
      envNoToken
    );
    assert.equal(r503.status, 503);

    const env = { DB: db as unknown as D1Database, RELEASE_ADMIN_TOKEN: 'super-secret-admin' } as unknown as Env;
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer super-secret-admin' };

    // 2. Missing Authorization -> 401
    const r401Missing = await worker.fetch(
      new Request('https://api.test/api/admin/releases/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: '4.3.0' }),
      }),
      env
    );
    assert.equal(r401Missing.status, 401);

    // 3. Wrong token -> 401
    const r401Wrong = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
        body: JSON.stringify({ version: '4.3.0' }),
      }),
      env
    );
    assert.equal(r401Wrong.status, 401);

    // 4. Malformed JSON -> 400
    const r400Json = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', { method: 'POST', headers, body: '{bad' }),
      env
    );
    assert.equal(r400Json.status, 400);

    // 5. Invalid SemVer -> 400
    const r400Ver = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3' }),
      }),
      env
    );
    assert.equal(r400Ver.status, 400);

    // 6. Excessive batchLimit (> 50) -> 400
    const r400Batch = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0', batchSize: 51 }),
      }),
      env
    );
    assert.equal(r400Batch.status, 400);

    // 7. Unknown release version -> 404
    const r404 = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '9.9.9' }),
      }),
      env
    );
    assert.equal(r404.status, 404);

    // 8. Live dispatch WITHOUT explicit confirmLive: true -> 400 CONFIRMATION_REQUIRED
    const r400Confirm = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0', dryRun: false }),
      }),
      env
    );
    assert.equal(r400Confirm.status, 400);

    // 9. Live dispatch WITH confirmLive: true on draft release -> 409 RELEASE_NOT_PUBLISHED
    const r409Draft = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
      }),
      env
    );
    assert.equal(r409Draft.status, 409);

    // 10. Default dry-run (no dryRun field) -> 200 dryRun=true, 0 mutations
    const rDefaultDry = await worker.fetch(
      new Request('https://api.test/api/admin/releases/dispatch', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0' }),
      }),
      env
    );
    assert.equal(rDefaultDry.status, 200);
    assert.equal(((await rDefaultDry.json()) as { dryRun: boolean }).dryRun, true);
    assert.equal(db.deliveries.size, 0);

    // 11. Publish 4.3.0 -> visible; Rollback to draft -> hidden again!
    const pubRes = await worker.fetch(
      new Request('https://api.test/api/admin/releases/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0', publicationStatus: 'published' }),
      }),
      env
    );
    assert.equal(pubRes.status, 200);
    const latestAfterPub = (await (await worker.fetch(new Request('https://api.test/api/releases/latest'), env)).json()) as { release: { version: string } };
    assert.equal(latestAfterPub.release.version, '4.3.0');

    const unpubRes = await worker.fetch(
      new Request('https://api.test/api/admin/releases/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0', publicationStatus: 'draft' }),
      }),
      env
    );
    assert.equal(unpubRes.status, 200);
    const latestAfterRollback = (await (await worker.fetch(new Request('https://api.test/api/releases/latest'), env)).json()) as { release: { version: string } };
    assert.equal(latestAfterRollback.release.version, '4.2.1');
  });

  it('prevents duplicate Web Push under concurrent dispatches, crash-after-send pending, and unknown timeouts', async () => {
    const db = new MockReleaseD1();
    const vapid = await makeVapid();
    const k1 = await makeSubKeys();
    const k2 = await makeSubKeys();
    const k3 = await makeSubKeys();

    // u1: normal recipient (concurrent race test)
    // u2: timeout / unknown outcome test
    // u3: stuck in 'pending' (simulated crash after send)
    db.prefs.set('u1', { enabled: 1, release_updates_enabled: 1 });
    db.prefs.set('u2', { enabled: 1, release_updates_enabled: 1 });
    db.prefs.set('u3', { enabled: 1, release_updates_enabled: 1 });
    db.subs.push(
      { id: 's1', user_id: 'u1', endpoint: 'https://fcm.googleapis.com/fcm/send/u1', p256dh: k1.p256dh, auth: k1.auth, fail_count: 0, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 's2', user_id: 'u2', endpoint: 'https://fcm.googleapis.com/fcm/send/u2-timeout', p256dh: k2.p256dh, auth: k2.auth, fail_count: 0, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 's3', user_id: 'u3', endpoint: 'https://fcm.googleapis.com/fcm/send/u3', p256dh: k3.p256dh, auth: k3.auth, fail_count: 0, created_at: '2026-01-01T00:00:00.000Z' }
    );
    db.deliveries.set('rel_4_3_0:u3', {
      release_id: 'rel_4_3_0',
      user_id: 'u3',
      subscription_id: 's3',
      status: 'pending',
      attempt_count: 1,
      next_retry_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    const env = {
      DB: db as unknown as D1Database,
      RELEASE_ADMIN_TOKEN: 'sec',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@uni-schedule.app',
    } as unknown as Env;
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer sec' };

    await worker.fetch(
      new Request('https://api.test/api/admin/releases/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0' }),
      }),
      env
    );

    const pushCallsByEndpoint = new Map<string, number>();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      pushCallsByEndpoint.set(url, (pushCallsByEndpoint.get(url) ?? 0) + 1);
      await new Promise((r) => setTimeout(r, 25)); // Force concurrency overlap
      if (url.endsWith('u2-timeout')) {
        throw new Error('AbortError: network timeout');
      }
      return new Response('', { status: 201 });
    }) as typeof fetch;

    try {
      // Fire TWO concurrent dispatch calls simultaneously!
      const [rA, rB] = await Promise.all([
        worker.fetch(
          new Request('https://api.test/api/admin/releases/dispatch', {
            method: 'POST',
            headers,
            body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
          }),
          env
        ),
        worker.fetch(
          new Request('https://api.test/api/admin/releases/dispatch', {
            method: 'POST',
            headers,
            body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
          }),
          env
        ),
      ]);
      assert.equal(rA.status, 200);
      assert.equal(rB.status, 200);
      const dA = (await rA.json()) as { sent: number; unknown: number; skippedConcurrent: number };
      const dB = (await rB.json()) as { sent: number; unknown: number; skippedConcurrent: number };

      assert.equal(dA.sent + dB.sent, 1, 'u1 must be sent EXACTLY once across concurrent workers');
      assert.equal(dA.unknown + dB.unknown, 1, 'u2 timeout must be recorded as unknown');
      assert.equal(dA.skippedConcurrent + dB.skippedConcurrent, 2, 'Second concurrent worker must skip both claimed users');

      // Re-run dispatch: u1 (sent), u2 (unknown), u3 (pending) must ALL be skipped -> 0 new push calls!
      const rThird = await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
        }),
        env
      );
      const dThird = (await rThird.json()) as { batchProcessed: number };
      assert.equal(dThird.batchProcessed, 0);

      assert.equal(pushCallsByEndpoint.get('https://fcm.googleapis.com/fcm/send/u1'), 1);
      assert.equal(pushCallsByEndpoint.get('https://fcm.googleapis.com/fcm/send/u2-timeout'), 1);
      assert.equal(pushCallsByEndpoint.get('https://fcm.googleapis.com/fcm/send/u3') ?? 0, 0);
      assert.equal(db.deliveries.get('rel_4_3_0:u2')?.status, 'unknown');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('handles 51-recipient batching, multi-device 410 failover, retry backoff, and max retry exhaustion without touching academic deliveries', async () => {
    const db = new MockReleaseD1();
    const vapid = await makeVapid();
    const keys = await makeSubKeys();
    db.academicDeliveries.set('acad-1', { id: 'acad-1', status: 'sent' });

    // 51 eligible users: u01..u51
    for (let i = 1; i <= 51; i += 1) {
      const uid = `u${String(i).padStart(2, '0')}`;
      db.prefs.set(uid, { enabled: 1, release_updates_enabled: 1 });
      db.subs.push({
        id: `sub-${uid}-primary`,
        user_id: uid,
        endpoint: `https://fcm.googleapis.com/fcm/send/${uid}`,
        p256dh: keys.p256dh,
        auth: keys.auth,
        fail_count: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        last_success_at: '2026-01-02T00:00:00.000Z',
      });
    }
    // Give u01 a second healthy device (primary will 410, secondary will 201)
    db.subs.push({
      id: 'sub-u01-secondary',
      user_id: 'u01',
      endpoint: 'https://fcm.googleapis.com/fcm/send/u01-backup',
      p256dh: keys.p256dh,
      auth: keys.auth,
      fail_count: 0,
      created_at: '2026-01-01T00:00:00.000Z',
      last_success_at: '2026-01-01T12:00:00.000Z',
    });

    const env = {
      DB: db as unknown as D1Database,
      RELEASE_ADMIN_TOKEN: 'sec',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@uni-schedule.app',
    } as unknown as Env;
    const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer sec' };

    await worker.fetch(
      new Request('https://api.test/api/admin/releases/publish', {
        method: 'POST',
        headers,
        body: JSON.stringify({ version: '4.3.0' }),
      }),
      env
    );

    let totalPushCalls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      totalPushCalls += 1;
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith('/u01')) return new Response('', { status: 410 });
      if (url.endsWith('/u02')) return new Response('', { status: 503 }); // transient failure
      return new Response('', { status: 201 });
    }) as typeof fetch;

    try {
      // Batch 1: 50 processed, 1 remaining (u51)
      const b1 = (await (await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true, batchSize: 50 }),
        }),
        env
      )).json()) as { batchProcessed: number; remainingEligible: number; sent: number; failed: number };
      assert.equal(b1.batchProcessed, 50);
      assert.equal(b1.remainingEligible, 1);
      assert.equal(b1.sent, 49); // u01 succeeded via backup, u02 failed with 503
      assert.equal(b1.failed, 1);
      assert.equal(db.subs.find((s) => s.id === 'sub-u01-primary')?.fail_count, 10, '410 primary sub deactivated');
      assert.equal(db.deliveries.get('rel_4_3_0:u01')?.subscription_id, 'sub-u01-secondary');

      // Batch 2: u51 sent, u02 still in retry backoff (next_retry_at in future) -> NOT retried yet!
      const b2 = (await (await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true, batchSize: 50 }),
        }),
        env
      )).json()) as { batchProcessed: number; remainingEligible: number; sent: number };
      assert.equal(b2.batchProcessed, 1);
      assert.equal(b2.remainingEligible, 0);
      assert.equal(b2.sent, 1);

      // Simulate backoff expiry for u02 twice -> attempts 2 & 3 fail -> exhausted (no infinite loop!)
      const u02Row = db.deliveries.get('rel_4_3_0:u02')!;
      u02Row.next_retry_at = '2020-01-01T00:00:00.000Z';
      const rRetry2 = (await (await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
        }),
        env
      )).json()) as { batchProcessed: number; failed: number };
      assert.equal(rRetry2.batchProcessed, 1);
      assert.equal(rRetry2.failed, 1);
      assert.equal(db.deliveries.get('rel_4_3_0:u02')?.attempt_count, 2);

      u02Row.next_retry_at = '2020-01-01T00:00:00.000Z';
      const rRetry3 = (await (await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
        }),
        env
      )).json()) as { batchProcessed: number; failed: number };
      assert.equal(rRetry3.batchProcessed, 1);
      assert.equal(db.deliveries.get('rel_4_3_0:u02')?.attempt_count, 3);

      // Attempt 4 must NOT happen (exhausted)
      const rAfterExhaust = (await (await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
        }),
        env
      )).json()) as { batchProcessed: number };
      assert.equal(rAfterExhaust.batchProcessed, 0);

      // Total exact push calls: 50 (batch 1) + 1 (u01 backup) + 1 (u51) + 2 (u02 retries) = 54
      assert.equal(totalPushCalls, 54);
      // Academic delivery untouched
      assert.equal(db.academicDeliveries.get('acad-1')?.status, 'sent');
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('preserves release_updates_enabled on v4.2.1 preference updates, enforces opt-out race guard, and excludes post-cutoff subscribers', async () => {
    const db = new MockReleaseD1();
    const vapid = await makeVapid();
    const keys = await makeSubKeys();
    const env = {
      DB: db as unknown as D1Database,
      RELEASE_ADMIN_TOKEN: 'sec',
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: 'mailto:test@uni-schedule.app',
    } as unknown as Env;

    const rawToken = 'dev-token-v421-compat-123456';
    const tokenHash = await hashSyncToken(rawToken, resolveTokenPepper(env));
    db.devices.set('dev-1', { id: 'dev-1', user_id: 'u1', token_hash: tokenHash, revoked_at: null });
    db.prefs.set('u1', {
      user_id: 'u1',
      enabled: 1,
      morning_enabled: 1,
      morning_time: '08:00',
      before_lesson_enabled: 1,
      before_lesson_minutes: 10,
      before_end_enabled: 0,
      before_end_minutes: 10,
      evening_enabled: 1,
      evening_time: '20:00',
      friday_enabled: 1,
      friday_time: '18:00',
      schedule_change_enabled: 1,
      release_updates_enabled: 1,
      release_updates_enabled_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    // 1. Old v4.2.1 client updates morningTime WITHOUT sending releaseUpdatesEnabled -> preserves state & original consent timestamp
    const v421Res = await worker.fetch(
      new Request('https://api.test/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({ enabled: true, morningTime: '07:45' }),
      }),
      env
    );
    assert.equal(v421Res.status, 200);
    const v421Data = (await v421Res.json()) as { preferences: { releaseUpdatesEnabled: boolean; morningTime: string } };
    assert.equal(v421Data.preferences.morningTime, '07:45');
    assert.equal(v421Data.preferences.releaseUpdatesEnabled, true, 'Missing field from v4.2.1 must preserve opt-in');
    assert.equal(db.prefs.get('u1')?.release_updates_enabled_at, '2026-01-01T00:00:00.000Z', 'Missing field must preserve original consent timestamp');

    // 1b. true -> true preserves original consent timestamp
    await worker.fetch(
      new Request('https://api.test/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({ releaseUpdatesEnabled: true }),
      }),
      env
    );
    assert.equal(db.prefs.get('u1')?.release_updates_enabled_at, '2026-01-01T00:00:00.000Z', 'true -> true must preserve original timestamp');

    // 2. Explicit opt-out (true -> false) clears consent timestamp
    const optOutRes = await worker.fetch(
      new Request('https://api.test/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({ releaseUpdatesEnabled: false }),
      }),
      env
    );
    assert.equal(((await optOutRes.json()) as { preferences: { releaseUpdatesEnabled: boolean } }).preferences.releaseUpdatesEnabled, false);
    assert.equal(db.prefs.get('u1')?.release_updates_enabled_at, null, 'true -> false must clear consent timestamp');

    // 2b. Re-enable (false -> true) sets a fresh server timestamp
    await worker.fetch(
      new Request('https://api.test/api/notifications/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({ releaseUpdatesEnabled: true }),
      }),
      env
    );
    const freshConsentTs = db.prefs.get('u1')?.release_updates_enabled_at as string;
    assert.ok(freshConsentTs && freshConsentTs > '2026-01-01T00:00:00.000Z', 'false -> true must record fresh server consent timestamp');

    // 3. Re-enable for opt-out-during-batch race test + post-cutoff subscriber u-late + pre-release sub with post-release consent u-late-consent
    db.prefs.get('u1')!.release_updates_enabled = 1;
    db.prefs.get('u1')!.release_updates_enabled_at = '2026-01-01T00:00:00.000Z';
    db.prefs.set('u-late', { enabled: 1, release_updates_enabled: 1, release_updates_enabled_at: '2026-12-31T00:00:00.000Z', updated_at: '2026-12-31T00:00:00.000Z' });
    db.prefs.set('u-late-consent', { enabled: 1, release_updates_enabled: 1, release_updates_enabled_at: '2026-11-26T13:00:00.000Z', updated_at: '2026-11-26T13:00:00.000Z' });
    db.subs.push(
      { id: 's-u1', user_id: 'u1', endpoint: 'https://fcm.googleapis.com/fcm/send/u1', p256dh: keys.p256dh, auth: keys.auth, fail_count: 0, created_at: '2026-01-01T00:00:00.000Z' },
      { id: 's-late', user_id: 'u-late', endpoint: 'https://fcm.googleapis.com/fcm/send/ulate', p256dh: keys.p256dh, auth: keys.auth, fail_count: 0, created_at: '2026-12-31T00:00:00.000Z' },
      { id: 's-late-consent', user_id: 'u-late-consent', endpoint: 'https://fcm.googleapis.com/fcm/send/ulateconsent', p256dh: keys.p256dh, auth: keys.auth, fail_count: 0, created_at: '2026-01-01T00:00:00.000Z' }
    );

    const adminHeaders = { 'Content-Type': 'application/json', Authorization: 'Bearer sec' };
    await worker.fetch(
      new Request('https://api.test/api/admin/releases/publish', {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({ version: '4.3.0', eligibilityCutoffAt: '2026-11-26T12:00:00.000Z' }),
      }),
      env
    );

    // Simulate u1 turning off release_updates_enabled AFTER SELECT but BEFORE atomic claim
    db.onBeforeClaim = (uid) => {
      if (uid === 'u1') db.prefs.get('u1')!.release_updates_enabled = 0;
    };

    let pushCount = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      pushCount += 1;
      return new Response('', { status: 201 });
    }) as typeof fetch;

    try {
      const disp = (await (await worker.fetch(
        new Request('https://api.test/api/admin/releases/dispatch', {
          method: 'POST',
          headers: adminHeaders,
          body: JSON.stringify({ version: '4.3.0', dryRun: false, confirmLive: true }),
        }),
        env
      )).json()) as { batchProcessed: number; sent: number; skippedConcurrent: number };
      assert.equal(disp.batchProcessed, 1, 'u-late must be excluded by eligibilityCutoffAt');
      assert.equal(disp.sent, 0, 'u1 disabled consent before claim -> must send 0');
      assert.equal(disp.skippedConcurrent, 1);
      assert.equal(pushCount, 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
