import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import { runNotificationCron, type ActiveSubscriptionRow, type ScheduledLessonRow } from '../src/push/scheduler';
import { bytesToBase64Url } from '../src/push/webPush';
import type { Env } from '../src/types';

async function makeVapid() {
  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as { d: string };
  const pub = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const pad = jwk.d + '='.repeat((4 - (jwk.d.length % 4)) % 4);
  const privBytes = Uint8Array.from(atob(pad.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
  return {
    publicKey: bytesToBase64Url(pub),
    privateKey: bytesToBase64Url(privBytes),
    subject: 'mailto:loadtest@uni-schedule.app',
  };
}

class InstrumentedD1 {
  public reads = 0;
  public writes = 0;
  public subs: ActiveSubscriptionRow[] = [];
  public lessons: ScheduledLessonRow[] = [];
  public logs = new Set<string>();

  public prepare(sql: string): D1PreparedStatement {
    const db = this;
    const stmt = {
      bind() {
        return stmt;
      },
      async first<T = unknown>(): Promise<T | null> {
        const res = await stmt.all<T>();
        return res.results[0] ?? null;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        db.reads += 1;
        const norm = sql.replace(/\s+/g, ' ').trim();
        let results: unknown[] = [];
        if (norm.startsWith('SELECT ps.id AS sub_id')) {
          results = db.subs;
        } else if (norm.startsWith('SELECT lesson_id, lesson_date')) {
          results = db.lessons;
        }
        return {
          results: results as T[],
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, served_by: 'sim', rows_read: results.length, rows_written: 0, changed_db: false, size_after: 0 },
        };
      },
      async run(): Promise<D1Result> {
        db.writes += 1;
        const norm = sql.replace(/\s+/g, ' ').trim();
        let changes = 1;
        if (norm.startsWith('INSERT OR IGNORE INTO notification_logs')) {
          const key = `k_${db.writes}`;
          db.logs.add(key);
        }
        return {
          results: [],
          success: true,
          meta: { duration: 0, changes, last_row_id: 0, served_by: 'sim', rows_read: 0, rows_written: changes, changed_db: true, size_after: 0 },
        };
      },
      async raw() {
        return [];
      },
    };
    return stmt as unknown as D1PreparedStatement;
  }

  public async batch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const out: D1Result[] = [];
    for (const s of statements) out.push(await s.run());
    return out;
  }
}

describe('workers/api Stage 6 Load Simulation (10, 50, 100, 500 users)', () => {
  it('measures D1 operations and Cron execution time across 10, 50, 100, and 500 subscribers', async () => {
    const vapid = await makeVapid();
    const kp = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
    const p256dh = bytesToBase64Url(
      new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer)
    );
    const auth = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(16)));

    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 201 })) as typeof fetch;

    try {
      const counts = [10, 50, 100, 500];
      const metrics: Array<{ users: number; ms: number; d1Reads: number; d1Writes: number; sent: number }> = [];

      for (const userCount of counts) {
        const db = new InstrumentedD1();
        db.lessons = [
          {
            lesson_id: 'l1',
            lesson_date: '2026-11-20',
            day_of_week: 5,
            pair_number: 1,
            start_time: '08:30',
            end_time: '09:50',
            subject: 'Програмування',
            lesson_type: 'Лекція',
            teacher: 'Іванов',
            room: '101',
            building: 'Г',
            subgroup: null,
          },
        ];

        for (let i = 0; i < userCount; i += 1) {
          db.subs.push({
            sub_id: `sub-${i}`,
            user_id: `user-${i}`,
            device_id: `dev-${i}`,
            endpoint: `https://push.sim/${i}`,
            p256dh,
            auth,
            university_id: 'lnu',
            group_id: 'ФЕП-33с',
            subgroup: 1,
            timezone: 'Europe/Kyiv',
            morning_enabled: 1,
            morning_time: '08:00',
            before_lesson_enabled: 0,
            before_lesson_minutes: 10,
            before_end_enabled: 0,
            before_end_minutes: 10,
            evening_enabled: 0,
            evening_time: '20:00',
            friday_enabled: 0,
            friday_time: '18:00',
          });
        }

        const env: Env = {
          DB: db as unknown as D1Database,
          VAPID_PUBLIC_KEY: vapid.publicKey,
          VAPID_PRIVATE_KEY: vapid.privateKey,
          VAPID_SUBJECT: vapid.subject,
        };

        const t0 = performance.now();
        // 06:00 UTC -> 08:00 Europe/Kyiv morning peak
        const res = await runNotificationCron(env, new Date('2026-11-20T06:00:00Z'));
        const elapsedMs = Math.round(performance.now() - t0);

        assert.equal(res.sent, userCount);
        metrics.push({
          users: userCount,
          ms: elapsedMs,
          d1Reads: db.reads,
          d1Writes: db.writes,
          sent: res.sent,
        });
      }

      console.log('SIMULATED_LOAD_METRICS:', JSON.stringify(metrics));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
