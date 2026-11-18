import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import worker from '../src/index';
import {
  computeSummaryCounts,
  evaluateNotificationsForUser,
  type ActiveSubscriptionRow,
  type ScheduledLessonRow,
} from '../src/push/scheduler';
import { buildStableLessonId } from '../../../src/integrations/universities/normalizers/scheduleNormalizer';
import type { Env } from '../src/types';

class MockAttendanceD1 {
  public users = new Map<string, Record<string, unknown>>();
  public user_devices = new Map<string, Record<string, unknown>>();
  public student_profiles = new Map<string, Record<string, unknown>>();
  public attendance_records = new Map<string, Record<string, unknown>>();
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
        } else if (norm.startsWith('SELECT lesson_id, lesson_date, status, updated_at, device_id FROM attendance_records')) {
          const userId = bound[0] as string;
          const hasSince = norm.includes('updated_at > ?');
          const since = hasSince ? (bound[1] as string) : null;
          results = Array.from(db.attendance_records.values()).filter((r) => {
            if (r.user_id !== userId) return false;
            if (since && (r.updated_at as string) <= since) return false;
            return true;
          });
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
          db.student_profiles.set(bound[0] as string, { user_id: bound[0] });
          changes = 1;
        } else if (norm.startsWith('INSERT INTO attendance_records')) {
          const [user_id, lesson_id, lesson_date, status, updated_at, device_id] = bound as [
            string,
            string,
            string,
            string,
            string,
            string,
          ];
          const pk = `${user_id}::${lesson_id}::${lesson_date}`;
          const existing = db.attendance_records.get(pk);
          if (!existing || updated_at > (existing.updated_at as string)) {
            db.attendance_records.set(pk, {
              user_id,
              lesson_id,
              lesson_date,
              status,
              updated_at,
              device_id,
            });
            changes = 1;
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

describe('workers/api Stage 5 Attendance Sync & Accurate Summaries', () => {
  it('syncs across two devices, resolves LWW conflicts, deduplicates, and enforces IDOR isolation', async () => {
    const db = new MockAttendanceD1();
    const env: Env = { DB: db as unknown as D1Database };

    // Register User A Device 1 + Link Device 2
    const regA = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{"deviceName":"Phone"}' }),
      env
    );
    const { syncToken: tokenA1 } = (await regA.json()) as { syncToken: string };

    const linkA2 = await worker.fetch(
      new Request('https://api.test/api/devices/link', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA1}` },
        body: '{"deviceName":"Laptop"}',
      }),
      env
    );
    const { syncToken: tokenA2 } = (await linkA2.json()) as { syncToken: string };

    // Register User B (separate profile)
    const regB = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{"deviceName":"UserB"}' }),
      env
    );
    const { syncToken: tokenB } = (await regB.json()) as { syncToken: string };

    // Device 1 marks lesson attended at T1
    const sync1 = await worker.fetch(
      new Request('https://api.test/api/attendance/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              lessonId: 'lnu_fep33s_d3_p1',
              lessonDate: '2026-11-18',
              status: 'present',
              updatedAt: '2026-11-18T09:00:00.000Z',
            },
          ],
        }),
      }),
      env
    );
    assert.equal(sync1.status, 200);
    const b1 = (await sync1.json()) as { applied: number; records: Array<{ status: string }> };
    assert.equal(b1.applied, 1);
    assert.equal(b1.records[0]?.status, 'attended');

    // Device 2 updates same lesson to absent at newer T2 -> wins
    const sync2 = await worker.fetch(
      new Request('https://api.test/api/attendance/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              lessonId: 'lnu_fep33s_d3_p1',
              lessonDate: '2026-11-18',
              status: 'absent',
              updatedAt: '2026-11-18T10:00:00.000Z',
            },
          ],
        }),
      }),
      env
    );
    const b2 = (await sync2.json()) as { applied: number; records: Array<{ status: string }> };
    assert.equal(b2.applied, 1);
    assert.equal(b2.records[0]?.status, 'absent');

    // Device 1 sends an older offline mutation at T0 -> skipped, newer T2 preserved!
    const staleSync = await worker.fetch(
      new Request('https://api.test/api/attendance/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA1}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              lessonId: 'lnu_fep33s_d3_p1',
              lessonDate: '2026-11-18',
              status: 'excused',
              updatedAt: '2026-11-18T08:00:00.000Z',
            },
          ],
        }),
      }),
      env
    );
    const bStale = (await staleSync.json()) as { applied: number; skippedOlder: number; records: Array<{ status: string }> };
    assert.equal(bStale.applied, 0);
    assert.equal(bStale.skippedOlder, 1);
    assert.equal(bStale.records[0]?.status, 'absent');
    assert.equal(db.attendance_records.size, 1); // Zero duplicates!

    // User B cannot see User A's records (IDOR isolation)
    const userBGet = await worker.fetch(
      new Request('https://api.test/api/attendance', {
        headers: { Authorization: `Bearer ${tokenB}` },
      }),
      env
    );
    const userBData = (await userBGet.json()) as { records: unknown[] };
    assert.equal(userBData.records.length, 0);

    // Device 2 unmarks the lesson -> 'unmarked' tombstone propagates
    const unmarkRes = await worker.fetch(
      new Request('https://api.test/api/attendance/sync', {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenA2}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutations: [
            {
              lessonId: 'lnu_fep33s_d3_p1',
              lessonDate: '2026-11-18',
              status: 'unmarked',
              updatedAt: '2026-11-18T11:00:00.000Z',
            },
          ],
        }),
      }),
      env
    );
    const unmarkBody = (await unmarkRes.json()) as { records: Array<{ status: string }> };
    assert.equal(unmarkBody.records[0]?.status, 'unmarked');
  });

  it('computes accurate Evening & Friday summaries without counting unmarked as absent', () => {
    const stableId1 = buildStableLessonId({
      universityId: 'lnu',
      groupId: 'ФЕП-33с',
      dayOfWeek: 5,
      pairNumber: 1,
      subject: 'Програмування',
    });
    const stableId2 = buildStableLessonId({
      universityId: 'lnu',
      groupId: 'ФЕП-33с',
      dayOfWeek: 5,
      pairNumber: 2,
      subject: 'Бази даних',
    });
    const stableId3 = buildStableLessonId({
      universityId: 'lnu',
      groupId: 'ФЕП-33с',
      dayOfWeek: 5,
      pairNumber: 3,
      subject: 'Алгоритми',
    });

    const lessons: ScheduledLessonRow[] = [
      {
        lesson_id: stableId1,
        lesson_date: '2026-11-20',
        day_of_week: 5,
        pair_number: 1,
        start_time: '08:30',
        end_time: '09:50',
        subject: 'Програмування',
        lesson_type: 'Лекція',
        teacher: 'Новий Викладач (після заміни)',
        room: '999/Б',
        building: 'Б',
        subgroup: null,
      },
      {
        lesson_id: stableId2,
        lesson_date: '2026-11-20',
        day_of_week: 5,
        pair_number: 2,
        start_time: '10:10',
        end_time: '11:30',
        subject: 'Бази даних',
        lesson_type: 'Практична',
        teacher: null,
        room: null,
        building: null,
        subgroup: null,
      },
      {
        lesson_id: stableId3,
        lesson_date: '2026-11-20',
        day_of_week: 5,
        pair_number: 3,
        start_time: '11:50',
        end_time: '13:10',
        subject: 'Алгоритми',
        lesson_type: 'Лабораторна',
        teacher: null,
        room: null,
        building: null,
        subgroup: null,
      },
    ];

    const summary = computeSummaryCounts(
      lessons,
      [
        { lesson_id: stableId1, lesson_date: '2026-11-20', status: 'attended' },
        { lesson_id: stableId2, lesson_date: '2026-11-20', status: 'excused' },
        // stableId3 is intentionally unmarked!
      ],
      '2026-11-20'
    );

    assert.equal(summary.total, 3);
    assert.equal(summary.attended, 1);
    assert.equal(summary.absent, 0); // Unmarked NEVER counted as absent!
    assert.equal(summary.excused, 1);
    assert.equal(summary.unmarked, 1);

    const row: ActiveSubscriptionRow = {
      sub_id: 's1',
      user_id: 'u1',
      device_id: 'd1',
      endpoint: 'https://push.test/1',
      p256dh: 'p',
      auth: 'a',
      university_id: 'lnu',
      group_id: 'ФЕП-33с',
      subgroup: 1,
      timezone: 'Europe/Kyiv',
      morning_enabled: 0,
      morning_time: '08:00',
      before_lesson_enabled: 0,
      before_lesson_minutes: 10,
      before_end_enabled: 0,
      before_end_minutes: 10,
      evening_enabled: 1,
      evening_time: '20:00',
      friday_enabled: 1,
      friday_time: '18:00',
    };

    const evening = evaluateNotificationsForUser(
      row,
      { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 1200 },
      lessons,
      3,
      summary,
      summary
    );
    assert.match(evening[0]?.payload.body ?? '', /Відвідано: 1, пропущено: 0, поважна: 1, не відмічено: 1/);

    const friday = evaluateNotificationsForUser(
      row,
      { isoDate: '2026-11-20', weekday: 5, minutesOfDay: 1080 },
      lessons,
      3,
      summary,
      summary
    );
    assert.match(friday[0]?.payload.body ?? '', /Відвідано: 1, пропущено: 0, поважна: 1, не відмічено: 1/);
  });
});
