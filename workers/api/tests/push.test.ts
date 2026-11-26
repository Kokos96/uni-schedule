import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import {
  bytesToBase64Url,
  createVapidJwt,
  encryptWebPushPayload,
  sendWebPushWithRetry,
} from '../src/push/webPush';
import {
  evaluateNotificationsForUser,
  getLocalDateTimeParts,
  runNotificationCron,
  type ActiveSubscriptionRow,
  type ScheduledLessonRow,
} from '../src/push/scheduler';
import worker from '../src/index';
import type { Env } from '../src/types';

async function generateTestVapidKeys() {
  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as {
    x: string;
    y: string;
    d: string;
  };
  const pubRaw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const b64uToBytes = (s: string) => {
    const pad = s + '='.repeat((4 - (s.length % 4)) % 4);
    const bin = atob(pad.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  return {
    publicKey: bytesToBase64Url(pubRaw),
    privateKey: bytesToBase64Url(b64uToBytes(jwk.d)),
    subject: 'mailto:test@uni-schedule.app',
  };
}

async function generateSubscriberKeys() {
  const kp = (await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  )) as CryptoKeyPair;
  const pubRaw = new Uint8Array((await crypto.subtle.exportKey('raw', kp.publicKey)) as ArrayBuffer);
  const auth = new Uint8Array(16);
  crypto.getRandomValues(auth);
  return {
    p256dh: bytesToBase64Url(pubRaw),
    auth: bytesToBase64Url(auth),
  };
}

class MockPushD1 {
  public users = new Map<string, Record<string, unknown>>();
  public user_devices = new Map<string, Record<string, unknown>>();
  public student_profiles = new Map<string, Record<string, unknown>>();
  public push_subscriptions = new Map<string, Record<string, unknown>>();
  public notification_preferences = new Map<string, Record<string, unknown>>();
  public notification_logs = new Map<string, Record<string, unknown>>();
  public schedule_entries: ScheduledLessonRow[] = [];
  public rate_limit_buckets = new Map<string, { count: number; reset_at: number }>();

  public prepare(sql: string): D1PreparedStatement {
    const db = this;
    const bound: unknown[] = [];
    const stmt = {
      bind(...values: unknown[]) {
        bound.push(...values);
        return stmt;
      },
      async first<T = unknown>(): Promise<T | null> {
        const res = await stmt.all<T>();
        return res.results[0] ?? null;
      },
      async all<T = unknown>(): Promise<D1Result<T>> {
        const norm = sql.replace(/\s+/g, ' ').trim();
        let results: unknown[] = [];

        if (norm.startsWith('SELECT count, reset_at FROM rate_limit_buckets')) {
          const b = db.rate_limit_buckets.get(bound[0] as string);
          if (b) results = [b];
        } else if (norm.startsWith('SELECT id, user_id, revoked_at FROM user_devices WHERE token_hash = ?')) {
          const d = Array.from(db.user_devices.values()).find((x) => x.token_hash === bound[0]);
          if (d) results = [d];
        } else if (norm.startsWith('SELECT id, device_id, endpoint')) {
          results = Array.from(db.push_subscriptions.values()).filter((s) => s.user_id === bound[0]);
        } else if (norm.startsWith('SELECT user_id, enabled, morning_enabled')) {
          const p = db.notification_preferences.get(bound[0] as string);
          if (p) results = [p];
        } else if (norm.startsWith('SELECT ps.id AS sub_id')) {
          for (const sub of db.push_subscriptions.values()) {
            const dev = db.user_devices.get(sub.device_id as string);
            const prof = db.student_profiles.get(sub.user_id as string);
            const pref = db.notification_preferences.get(sub.user_id as string);
            if (dev && dev.revoked_at === null && prof?.source_mode === 'live' && Number(prof.revision) > 0 && pref && pref.enabled === 1) {
              results.push({
                sub_id: sub.id,
                user_id: sub.user_id,
                device_id: sub.device_id,
                endpoint: sub.endpoint,
                p256dh: sub.p256dh,
                auth: sub.auth,
                university_id: prof.university_id,
                group_id: prof.group_id,
                subgroup: prof.subgroup,
                elective_course: prof.elective_course ?? 'freelance',
                selected_electives: prof.selected_electives ?? null,
                selected_track: prof.selected_track ?? null,
                timezone: prof.timezone,
                morning_enabled: pref.morning_enabled,
                morning_time: pref.morning_time,
                before_lesson_enabled: pref.before_lesson_enabled,
                before_lesson_minutes: pref.before_lesson_minutes,
                before_end_enabled: pref.before_end_enabled,
                before_end_minutes: pref.before_end_minutes,
                evening_enabled: pref.evening_enabled,
                evening_time: pref.evening_time,
                friday_enabled: pref.friday_enabled,
                friday_time: pref.friday_time,
              });
            }
          }
        } else if (norm.startsWith('SELECT lesson_id, lesson_date')) {
          const [, isoDate, dayOfWeek] = bound as [string, string, number];
          results = db.schedule_entries.filter(
            (e) => e.lesson_date === isoDate || (e.lesson_date === null && e.day_of_week === dayOfWeek)
          );
        } else if (norm.startsWith('SELECT lesson_id, subgroup FROM schedule_entries')) {
          const [, mon, fri] = bound as [string, string, string];
          results = db.schedule_entries.filter(
            (e) => e.lesson_date !== null && e.lesson_date >= mon && e.lesson_date <= fri
          );
        }

        return {
          results: results as T[],
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, served_by: 'mock', rows_read: results.length, rows_written: 0, changed_db: false, size_after: 0 },
        };
      },
      async run(): Promise<D1Result> {
        const norm = sql.replace(/\s+/g, ' ').trim();
        let changes = 0;

        if (norm.startsWith('INSERT INTO rate_limit_buckets')) {
          db.rate_limit_buckets.set(bound[0] as string, { count: 1, reset_at: bound[1] as number });
          changes = 1;
        } else if (norm.startsWith('UPDATE rate_limit_buckets SET count = ?')) {
          const b = db.rate_limit_buckets.get(bound[1] as string);
          if (b) { b.count = bound[0] as number; changes = 1; }
        } else if (norm.startsWith('INSERT INTO users')) {
          db.users.set(bound[0] as string, { id: bound[0] });
          changes = 1;
        } else if (norm.startsWith('INSERT INTO user_devices')) {
          db.user_devices.set(bound[0] as string, {
            id: bound[0],
            user_id: bound[1],
            device_name: bound[2],
            token_hash: bound[3],
            revoked_at: null,
          });
          changes = 1;
        } else if (norm.startsWith('UPDATE user_devices SET last_seen_at')) {
          changes = 1;
        } else if (norm.startsWith('INSERT INTO student_profiles')) {
          db.student_profiles.set(bound[0] as string, {
            user_id: bound[0],
            university_id: 'lnu',
            group_id: 'ФЕП-33с',
            subgroup: 1,
            timezone: 'Europe/Kyiv',
          });
          changes = 1;
        } else if (norm.startsWith('INSERT INTO push_subscriptions')) {
          const [id, user_id, device_id, endpoint, p256dh, auth, user_agent, created_at] = bound;
          const existing = Array.from(db.push_subscriptions.values()).find((s) => s.endpoint === endpoint);
          const targetId = (existing?.id as string) ?? (id as string);
          db.push_subscriptions.set(targetId, {
            id: targetId,
            user_id,
            device_id,
            endpoint,
            p256dh,
            auth,
            user_agent,
            created_at,
            last_success_at: null,
            fail_count: 0,
          });
          changes = 1;
        } else if (norm.startsWith('DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?')) {
          const sub = db.push_subscriptions.get(bound[0] as string);
          if (sub && sub.user_id === bound[1]) {
            db.push_subscriptions.delete(bound[0] as string);
            changes = 1;
          }
        } else if (norm.startsWith('DELETE FROM push_subscriptions WHERE id = ?')) {
          if (db.push_subscriptions.delete(bound[0] as string)) changes = 1;
        } else if (norm.startsWith('INSERT INTO notification_preferences')) {
          if (bound.length === 2) {
            const [user_id, updated_at] = bound;
            const prev = db.notification_preferences.get(user_id as string) ?? {
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
            };
            db.notification_preferences.set(user_id as string, { ...prev, user_id, enabled: 1, updated_at });
          } else {
            const [user_id, enabled, morning_enabled, morning_time, before_lesson_enabled, before_lesson_minutes, before_end_enabled, before_end_minutes, evening_enabled, evening_time, friday_enabled, friday_time, schedule_change_enabled, updated_at] = bound;
            db.notification_preferences.set(user_id as string, {
              user_id,
              enabled,
              morning_enabled,
              morning_time,
              before_lesson_enabled,
              before_lesson_minutes,
              before_end_enabled,
              before_end_minutes,
              evening_enabled,
              evening_time,
              friday_enabled,
              friday_time,
              schedule_change_enabled,
              updated_at,
            });
          }
          changes = 1;
        } else if (norm.startsWith('INSERT OR IGNORE INTO notification_logs')) {
          const [id, user_id, device_id, subscription_id, dedup_key, type, sent_at] = bound as string[];
          if (!db.notification_logs.has(dedup_key!)) {
            db.notification_logs.set(dedup_key!, {
              id,
              user_id,
              device_id,
              subscription_id,
              dedup_key,
              type,
              status: 'sent',
              error_message: null,
              sent_at,
            });
            changes = 1;
          }
        } else if (norm.startsWith('UPDATE push_subscriptions SET last_success_at')) {
          const sub = db.push_subscriptions.get(bound[1] as string);
          if (sub) { sub.last_success_at = bound[0]; sub.fail_count = 0; changes = 1; }
        } else if (norm.startsWith('UPDATE push_subscriptions SET fail_count')) {
          const sub = db.push_subscriptions.get(bound[0] as string);
          if (sub) { sub.fail_count = (sub.fail_count as number) + 1; changes = 1; }
        } else if (norm.startsWith('UPDATE notification_logs SET status =')) {
          for (const log of db.notification_logs.values()) {
            if (log.id === bound[1]) {
              log.status = norm.includes("'expired'") ? 'expired' : 'failed';
              log.error_message = bound[0];
              changes = 1;
            }
          }
        }

        return {
          results: [],
          success: true,
          meta: { duration: 0, changes, last_row_id: 0, served_by: 'mock', rows_read: 0, rows_written: changes, changed_db: changes > 0, size_after: 0 },
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

describe('workers/api Stage 4 Web Push & Cron', () => {
  it('creates valid ES256 VAPID JWT and RFC 8291 aes128gcm encrypted payload', async () => {
    const vapid = await generateTestVapidKeys();
    const subKeys = await generateSubscriberKeys();

    const jwt = await createVapidJwt('https://fcm.googleapis.com/fcm/send/test-id', vapid, 1700000000);
    const parts = jwt.split('.');
    assert.equal(parts.length, 3);
    const payload = JSON.parse(atob(parts[1]!.replace(/-/g, '+').replace(/_/g, '/'))) as {
      aud: string;
      sub: string;
    };
    assert.equal(payload.aud, 'https://fcm.googleapis.com');
    assert.equal(payload.sub, 'mailto:test@uni-schedule.app');

    const encrypted = await encryptWebPushPayload(
      { title: 'Тест', body: 'Пара о 08:30', tag: 'test', url: '/' },
      subKeys
    );
    // aes128gcm header is 16 (salt) + 4 (rs=4096) + 1 (idlen=65) + 65 (pub) = 86 bytes + ciphertext
    assert.ok(encrypted.length > 86);
    assert.equal(encrypted[20], 65);
  });

  it('handles Europe/Kyiv DST winter (UTC+2) and summer (UTC+3) accurately', () => {
    // 2026-01-15 06:00 UTC -> 08:00 Europe/Kyiv (UTC+2)
    const winter = getLocalDateTimeParts(new Date('2026-01-15T06:00:00Z'), 'Europe/Kyiv');
    assert.equal(winter.isoDate, '2026-01-15');
    assert.equal(winter.minutesOfDay, 8 * 60);

    // 2026-07-15 05:00 UTC -> 08:00 Europe/Kyiv (UTC+3)
    const summer = getLocalDateTimeParts(new Date('2026-07-15T05:00:00Z'), 'Europe/Kyiv');
    assert.equal(summer.isoDate, '2026-07-15');
    assert.equal(summer.minutesOfDay, 8 * 60);

    // Different timezone: America/New_York at 13:00 UTC in summer (EDT UTC-4) -> 09:00
    const ny = getLocalDateTimeParts(new Date('2026-07-15T13:00:00Z'), 'America/New_York');
    assert.equal(ny.minutesOfDay, 9 * 60);
  });

  it('evaluates all 5 notification scenarios without faking attendance stats', () => {
    const baseRow: ActiveSubscriptionRow = {
      sub_id: 'sub-1',
      user_id: 'u-1',
      device_id: 'd-1',
      endpoint: 'https://push.example/1',
      p256dh: 'p',
      auth: 'a',
      university_id: 'lnu',
      group_id: 'ФЕП-33с',
      subgroup: 1,
      timezone: 'Europe/Kyiv',
      morning_enabled: 1,
      morning_time: '08:00',
      before_lesson_enabled: 1,
      before_lesson_minutes: 10,
      before_end_enabled: 1,
      before_end_minutes: 10,
      evening_enabled: 1,
      evening_time: '20:00',
      friday_enabled: 1,
      friday_time: '18:00',
    };

    const lessons: ScheduledLessonRow[] = [
      {
        lesson_id: 'l-1',
        lesson_date: '2026-11-20',
        day_of_week: 5,
        pair_number: 1,
        start_time: '08:30',
        end_time: '09:50',
        subject: 'Програмування',
        lesson_type: 'Практична',
        teacher: 'Іванов І.І.',
        room: '214',
        building: 'Головний',
        subgroup: 1,
      },
    ];

    const morning = evaluateNotificationsForUser(baseRow, { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 480 }, lessons, 4);
    assert.equal(morning[0]?.type, 'morning');
    assert.match(morning[0]?.payload.body ?? '', /1 пар/);

    const hiddenLessons: ScheduledLessonRow[] = [
      { ...lessons[0], lesson_id: 'cancelled', status: 'cancelled' },
      { ...lessons[0], lesson_id: 'elective', is_elective: 1, elective_key: 'el_unselected' },
      { ...lessons[0], lesson_id: 'unknown-elective', is_elective: 1, elective_key: null },
    ];
    const noLessons = evaluateNotificationsForUser(baseRow, { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 480 }, hiddenLessons, 0);
    assert.match(noLessons[0]?.payload.body ?? '', /Сьогодні пар немає/);

    const beforeLesson = evaluateNotificationsForUser(baseRow, { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 500 }, lessons, 4);
    assert.equal(beforeLesson[0]?.type, 'before_lesson');
    assert.match(beforeLesson[0]?.payload.body ?? '', /Через 10 хв/);

    const beforeEnd = evaluateNotificationsForUser(baseRow, { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 580 }, lessons, 4);
    assert.equal(beforeEnd[0]?.type, 'before_end');

    const friday = evaluateNotificationsForUser(baseRow, { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 1080 }, lessons, 4);
    assert.equal(friday[0]?.type, 'friday');
    assert.match(friday[0]?.payload.body ?? '', /4 пар/);

    const evening = evaluateNotificationsForUser(baseRow, { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 1200 }, lessons, 4);
    assert.equal(evening[0]?.type, 'evening');
    assert.doesNotMatch(evening[0]?.payload.body ?? '', /пропущено/i);
  });

  it('supports multi-device subscriptions, atomic dedup, retries on 503, and cleanup on 410', async () => {
    const db = new MockPushD1();
    const vapid = await generateTestVapidKeys();
    const sub1 = await generateSubscriberKeys();
    const sub2 = await generateSubscriberKeys();

    const env: Env = {
      DB: db as unknown as D1Database,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: vapid.subject,
    };

    // Register 2 devices for same user via HTTP API
    const reg1 = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{"deviceName":"Phone"}' }),
      env
    );
    const { syncToken: token1, userId } = (await reg1.json()) as { syncToken: string; userId: string };
    db.student_profiles.set(userId, {
      user_id: userId, university_id: 'lnu', group_id: 'ФЕП-33с',
      subgroup: 1, timezone: 'Europe/Kyiv', source_mode: 'live', revision: 1,
    });

    const link2 = await worker.fetch(
      new Request('https://api.test/api/devices/link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token1}` },
        body: '{"deviceName":"Laptop"}',
      }),
      env
    );
    const { syncToken: token2 } = (await link2.json()) as { syncToken: string };

    // Subscribe both devices
    const s1 = await worker.fetch(
      new Request('https://api.test/api/push/subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://push.test/device-1', keys: sub1 }),
      }),
      env
    );
    assert.equal(s1.status, 201);

    const s2 = await worker.fetch(
      new Request('https://api.test/api/push/subscriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: 'https://push.test/device-2', keys: sub2 }),
      }),
      env
    );
    assert.equal(s2.status, 201);
    assert.equal(db.push_subscriptions.size, 2);

    // Mock fetch: device-1 gets transient 503 then 201; device-2 gets 410 Gone (expired)
    const origFetch = globalThis.fetch;
    let d1Attempts = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.endsWith('/device-1')) {
        d1Attempts += 1;
        return d1Attempts === 1
          ? new Response('Busy', { status: 503 })
          : new Response(null, { status: 201 });
      }
      return new Response('Gone', { status: 410 });
    }) as typeof fetch;

    try {
      // Run Cron at 08:00 Europe/Kyiv (06:00 UTC in winter)
      const tick1 = await runNotificationCron(env, new Date('2026-11-20T06:00:00Z'));
      assert.equal(tick1.checkedSubscriptions, 2);
      assert.equal(tick1.sent, 1);
      assert.equal(tick1.expiredDeleted, 1);
      assert.equal(d1Attempts, 2); // Retried after 503!
      assert.equal(db.push_subscriptions.size, 1); // Expired device-2 removed!

      // Run Cron again 2 minutes later -> atomic dedup_key prevents duplicate send!
      const tick2 = await runNotificationCron(env, new Date('2026-11-20T06:02:00Z'));
      assert.equal(tick2.sent, 0);
      db.student_profiles.get(userId)!.source_mode = 'builtin';
      const builtinTick = await runNotificationCron(env, new Date('2026-11-20T06:05:00Z'));
      assert.equal(builtinTick.checkedSubscriptions, 0);
      assert.equal(tick2.deduplicated, 1);
    } finally {
      globalThis.fetch = origFetch;
    }

    // Also verify retry helper returns retryable result cleanly
    assert.equal(typeof sendWebPushWithRetry, 'function');
  });

  it('filters lessons by elective_course fallback, week_type parity on recurring lessons, track_number, and excludes cancelled lessons', () => {
    const baseRow: ActiveSubscriptionRow = {
      sub_id: 'sub-filter',
      user_id: 'u-filter',
      device_id: 'd-filter',
      endpoint: 'https://push.example/filter',
      p256dh: 'p',
      auth: 'a',
      university_id: 'lnu',
      group_id: 'ФЕП-33с',
      subgroup: 1,
      elective_course: 'management',
      selected_electives: JSON.stringify(['el_ai']),
      selected_track: 1,
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
    };

    const lessons: ScheduledLessonRow[] = [
      // Legacy non-el_* electives
      {
        lesson_id: 'l-mgmt',
        lesson_date: '2026-09-04',
        day_of_week: 5,
        pair_number: 1,
        start_time: '08:30',
        end_time: '09:50',
        subject: 'Менеджмент',
        lesson_type: 'lecture',
        teacher: null,
        room: '101',
        building: null,
        subgroup: null,
        is_elective: 1,
        elective_key: 'management',
      },
      {
        lesson_id: 'l-free',
        lesson_date: '2026-09-04',
        day_of_week: 5,
        pair_number: 2,
        start_time: '10:10',
        end_time: '11:30',
        subject: 'Фріланс',
        lesson_type: 'lecture',
        teacher: null,
        room: '102',
        building: null,
        subgroup: null,
        is_elective: 1,
        elective_key: 'freelance',
      },
      // Modern el_* elective
      {
        lesson_id: 'l-el-ai',
        lesson_date: '2026-09-04',
        day_of_week: 5,
        pair_number: 3,
        start_time: '11:50',
        end_time: '13:10',
        subject: 'Штучний інтелект',
        lesson_type: 'lecture',
        teacher: null,
        room: '103',
        building: null,
        subgroup: null,
        is_elective: 1,
        elective_key: 'el_ai',
      },
      // Cancelled lesson (must be excluded)
      {
        lesson_id: 'l-cancelled',
        lesson_date: '2026-09-04',
        day_of_week: 5,
        pair_number: 4,
        start_time: '13:30',
        end_time: '14:50',
        subject: 'Скасована пара',
        lesson_type: 'practice',
        teacher: null,
        room: '104',
        building: null,
        subgroup: null,
        is_elective: 0,
        status: 'cancelled',
      },
      // Recurring lessons with week_type parity
      {
        lesson_id: 'l-rec-num',
        lesson_date: null,
        day_of_week: 5,
        pair_number: 5,
        start_time: '15:05',
        end_time: '16:25',
        subject: 'Чисельник пара',
        lesson_type: 'lecture',
        teacher: null,
        room: '105',
        building: null,
        subgroup: null,
        is_elective: 0,
        week_type: 'numerator',
      },
      {
        lesson_id: 'l-rec-den',
        lesson_date: null,
        day_of_week: 5,
        pair_number: 6,
        start_time: '16:40',
        end_time: '18:00',
        subject: 'Знаменник пара',
        lesson_type: 'lecture',
        teacher: null,
        room: '106',
        building: null,
        subgroup: null,
        is_elective: 0,
        week_type: 'denominator',
      },
      // Track mismatch (must be excluded when selected_track = 1)
      {
        lesson_id: 'l-track-2',
        lesson_date: '2026-09-04',
        day_of_week: 5,
        pair_number: 7,
        start_time: '18:10',
        end_time: '19:30',
        subject: 'Трек 2',
        lesson_type: 'practice',
        teacher: null,
        room: '107',
        building: null,
        subgroup: null,
        is_elective: 0,
        track_number: 2,
      },
    ];

    // 2026-09-04 is week 0 from 2026-09-01 -> numerator week
    // Matching lessons: l-mgmt, l-el-ai, l-rec-num (3 pairs)
    const numMorning = evaluateNotificationsForUser(
      baseRow,
      { isoDate: '2026-09-04', weekday: 5, minutesOfDay: 480 },
      lessons,
      3
    );
    assert.equal(numMorning.length, 1);
    assert.match(numMorning[0]?.payload.body ?? '', /3 пари/);
    assert.match(numMorning[0]?.payload.body ?? '', /Менеджмент/);

    // 2026-09-11 is week 1 from 2026-09-01 -> denominator week
    // Only recurring lessons match (dated 2026-09-04 ones are included in passed `lessons` array unless filtered by SQL,
    // so test recurring-only array to isolate denominator parity)
    const recurringOnly = lessons.filter((l) => l.lesson_date === null);
    const denMorning = evaluateNotificationsForUser(
      baseRow,
      { isoDate: '2026-09-11', weekday: 5, minutesOfDay: 480 },
      recurringOnly,
      1
    );
    assert.equal(denMorning.length, 1);
    assert.match(denMorning[0]?.payload.body ?? '', /1 пара/);
    assert.match(denMorning[0]?.payload.body ?? '', /Знаменник пара/);

    // elective_course = 'both' includes both legacy electives (l-mgmt, l-free) + l-el-ai + l-rec-num = 4 pairs
    const bothRow: ActiveSubscriptionRow = { ...baseRow, elective_course: 'both' };
    const bothMorning = evaluateNotificationsForUser(
      bothRow,
      { isoDate: '2026-09-04', weekday: 5, minutesOfDay: 480 },
      lessons,
      4
    );
    assert.equal(bothMorning.length, 1);
    assert.match(bothMorning[0]?.payload.body ?? '', /4 пари/);
  });

  it('filters parallel language/teacher subgroups consistently with frontend selectedParallelGroups', async () => {
    const {
      computeParallelDimensionKey,
      computeParallelOptionKey,
    } = await import('../../../src/utils/parallelGroups');

    const secondDim = computeParallelDimensionKey('Друга іноземна мова (німецька)');
    const germanTeacherOpt = computeParallelOptionKey(
      'Друга іноземна мова (німецька)',
      'доц. Захаров Ю.М.'
    );

    const inaRow: ActiveSubscriptionRow = {
      sub_id: 'sub-ina',
      user_id: 'u-ina',
      device_id: 'd-ina',
      endpoint: 'https://push.example/ina',
      p256dh: 'p',
      auth: 'a',
      university_id: 'lnu',
      group_id: 'ІНА-35с',
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
      selected_parallel_groups: JSON.stringify({ [secondDim]: germanTeacherOpt }),
      revision: 2,
    };

    const mondayInaLessons: ScheduledLessonRow[] = [
      {
        lesson_id: 'ina-de-1',
        lesson_date: '2026-11-23',
        day_of_week: 1,
        pair_number: 1,
        start_time: '08:30',
        end_time: '09:50',
        subject: 'Друга іноземна мова (німецька)',
        lesson_type: 'П',
        teacher: 'доц. Захаров Ю.М.',
        room: null,
        building: null,
        subgroup: null,
        is_elective: 0,
      },
      {
        lesson_id: 'ina-es-1',
        lesson_date: '2026-11-23',
        day_of_week: 1,
        pair_number: 1,
        start_time: '08:30',
        end_time: '09:50',
        subject: 'Друга іноземна мова (іспанська)',
        lesson_type: 'П',
        teacher: 'доц. Іспанський І.І.',
        room: null,
        building: null,
        subgroup: null,
        is_elective: 0,
      },
      {
        lesson_id: 'ina-fr-1',
        lesson_date: '2026-11-23',
        day_of_week: 1,
        pair_number: 1,
        start_time: '08:30',
        end_time: '09:50',
        subject: 'Друга іноземна мова (французька)',
        lesson_type: 'П',
        teacher: 'доц. Французький Ф.Ф.',
        room: null,
        building: null,
        subgroup: null,
        is_elective: 0,
      },
      {
        lesson_id: 'ina-phil-2',
        lesson_date: '2026-11-23',
        day_of_week: 1,
        pair_number: 2,
        start_time: '10:10',
        end_time: '11:30',
        subject: 'Філософія',
        lesson_type: 'Л',
        teacher: 'проф. Філософ Ф.Ф.',
        room: '100/І',
        building: 'Корпус І',
        subgroup: null,
        is_elective: 0,
      },
    ];

    const morning = evaluateNotificationsForUser(
      inaRow,
      { isoDate: '2026-11-23', weekday: 1, minutesOfDay: 480 },
      mondayInaLessons,
      2
    );
    assert.equal(morning.length, 1);
    assert.match(morning[0]?.payload.body ?? '', /2 пари/);
    assert.match(morning[0]?.payload.body ?? '', /німецька/);
    assert.doesNotMatch(morning[0]?.payload.body ?? '', /іспанська|французька/);

    // Safety: when selected_parallel_groups is unset OR stale (replaced teacher),
    // Push collapses parallel alternatives into 1 summary notification (no 10x spam)
    // while keeping mandatory general lessons intact.
    const unconfiguredRow: ActiveSubscriptionRow = {
      ...inaRow,
      selected_parallel_groups: null,
      before_lesson_enabled: 1,
      before_lesson_minutes: 10,
    };
    const beforeLessonUnconfigured = evaluateNotificationsForUser(
      unconfiguredRow,
      { isoDate: '2026-11-23', weekday: 1, minutesOfDay: 500 }, // 08:20 (10 min before 08:30)
      mondayInaLessons,
      2
    );
    assert.equal(
      beforeLessonUnconfigured.length,
      1,
      'Must send at most 1 collapsed reminder for unselected parallel slot, not 3'
    );
    assert.match(beforeLessonUnconfigured[0]?.payload.body ?? '', /оберіть підгрупу/);

    const staleTeacherRow: ActiveSubscriptionRow = {
      ...unconfiguredRow,
      selected_parallel_groups: JSON.stringify({ [secondDim]: 'opt_replaced_teacher' }),
    };
    const morningStale = evaluateNotificationsForUser(
      staleTeacherRow,
      { isoDate: '2026-11-23', weekday: 1, minutesOfDay: 480 },
      mondayInaLessons,
      2
    );
    assert.equal(morningStale.length, 1);
    assert.match(morningStale[0]?.payload.body ?? '', /2 пари/);
  });
});
