import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { webcrypto } from 'node:crypto';

if (!globalThis.crypto) {
  (globalThis as unknown as { crypto: Crypto }).crypto = webcrypto as unknown as Crypto;
}

import worker from '../src/index';
import type { Env } from '../src/types';

const FIXTURES_DIR = path.resolve(process.cwd(), 'tests/fixtures');
const HTML_FIXTURE = fs.readFileSync(path.join(FIXTURES_DIR, 'lnu-timetable.html'), 'utf-8');
const GROUPS_FIXTURE = fs.readFileSync(path.join(FIXTURES_DIR, 'lnu-groups.json'), 'utf-8');

/**
 * Lightweight in-memory D1 mock supporting the exact SQL statements used by workers/api.
 */
class MockD1Database {
  public users = new Map<string, { id: string; created_at: string; updated_at: string }>();
  public user_devices = new Map<
    string,
    {
      id: string;
      user_id: string;
      device_name: string;
      token_hash: string;
      created_at: string;
      last_seen_at: string;
      revoked_at: string | null;
    }
  >();
  public universities = new Map<
    string,
    {
      id: string;
      name: string;
      short_name: string;
      city: string;
      support_status: 'live' | 'manual_only';
      source_url: string | null;
    }
  >([
    [
      'lnu',
      {
        id: 'lnu',
        name: 'Львівський національний університет імені Івана Франка',
        short_name: 'ЛНУ ім. Івана Франка',
        city: 'Львів',
        support_status: 'live',
        source_url: 'https://dekanat.lnu.edu.ua/cgi-bin/timetable.cgi',
      },
    ],
    [
      'other',
      {
        id: 'other',
        name: 'Інший університет (ручний / локальний режим)',
        short_name: 'Інший ВНЗ',
        city: 'Україна',
        support_status: 'manual_only',
        source_url: null,
      },
    ],
  ]);
  public student_profiles = new Map<string, Record<string, unknown>>();
  public university_groups = new Map<string, Record<string, unknown>>();
  public schedule_entries = new Map<string, Record<string, unknown>>();
  public schedule_sync_logs: Array<Record<string, unknown>> = [];
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
        const normalized = sql.replace(/\s+/g, ' ').trim();
        let results: unknown[] = [];

        if (normalized.startsWith('SELECT id, user_id, revoked_at FROM user_devices WHERE token_hash = ?')) {
          const hash = bound[0] as string;
          const found = Array.from(db.user_devices.values()).find((d) => d.token_hash === hash);
          if (found) results = [found];
        } else if (normalized.startsWith('SELECT id, device_name, created_at, last_seen_at, revoked_at FROM user_devices')) {
          const userId = bound[0] as string;
          results = Array.from(db.user_devices.values()).filter((d) => d.user_id === userId);
        } else if (normalized.startsWith('SELECT count, reset_at FROM rate_limit_buckets')) {
          const key = bound[0] as string;
          const bucket = db.rate_limit_buckets.get(key);
          if (bucket) results = [bucket];
        } else if (normalized.startsWith('SELECT user_id, university_id')) {
          const userId = bound[0] as string;
          const prof = db.student_profiles.get(userId);
          if (prof) results = [prof];
        } else if (normalized.startsWith('SELECT id FROM universities WHERE id = ?')) {
          const id = bound[0] as string;
          const uni = db.universities.get(id);
          if (uni) results = [{ id: uni.id }];
        } else if (normalized.startsWith('SELECT id, name, short_name, city, support_status, source_url FROM universities')) {
          results = Array.from(db.universities.values());
        } else if (normalized.startsWith('SELECT MAX(created_at) as newest_at, COUNT(*) as total FROM university_groups')) {
          const uniId = bound[0] as string;
          const rows = Array.from(db.university_groups.values()).filter((g) => g.university_id === uniId);
          const newest = rows.reduce<string | null>((acc, g) => {
            const c = g.created_at as string;
            return !acc || c > acc ? c : acc;
          }, null);
          results = [{ newest_at: newest, total: rows.length }];
        } else if (normalized.startsWith('SELECT group_code, group_name, course FROM university_groups')) {
          results = Array.from(db.university_groups.values()).filter((g) => g.university_id === 'lnu');
        } else if (normalized.startsWith('SELECT id, last_synced_at, content_hash FROM university_groups WHERE id = ?')) {
          const id = bound[0] as string;
          const g = db.university_groups.get(id);
          if (g) results = [g];
        } else if (normalized.startsWith('SELECT lesson_id, lesson_date')) {
          const groupKey = bound[0] as string;
          results = Array.from(db.schedule_entries.values()).filter((e) => e.group_id === groupKey);
        }

        return {
          results: results as T[],
          success: true,
          meta: { duration: 0, changes: 0, last_row_id: 0, served_by: 'mock', rows_read: results.length, rows_written: 0, changed_db: false, size_after: 0 },
        };
      },
      async run(): Promise<D1Result> {
        const normalized = sql.replace(/\s+/g, ' ').trim();
        let changes = 0;

        if (normalized.startsWith('INSERT INTO users')) {
          const [id, created_at, updated_at] = bound as [string, string, string];
          db.users.set(id, { id, created_at, updated_at });
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO user_devices')) {
          const [id, user_id, device_name, token_hash, created_at, last_seen_at] = bound as [string, string, string, string, string, string];
          db.user_devices.set(id, { id, user_id, device_name, token_hash, created_at, last_seen_at, revoked_at: null });
          changes = 1;
        } else if (normalized.startsWith('UPDATE user_devices SET last_seen_at = ? WHERE id = ?')) {
          const [last_seen_at, id] = bound as [string, string];
          const d = db.user_devices.get(id);
          if (d) {
            d.last_seen_at = last_seen_at;
            changes = 1;
          }
        } else if (normalized.startsWith('UPDATE user_devices SET token_hash = ?')) {
          const [token_hash, last_seen_at, id, user_id] = bound as [string, string, string, string];
          const d = db.user_devices.get(id);
          if (d && d.user_id === user_id && d.revoked_at === null) {
            d.token_hash = token_hash;
            d.last_seen_at = last_seen_at;
            changes = 1;
          }
        } else if (normalized.startsWith('UPDATE user_devices SET revoked_at = ?')) {
          const [revoked_at, id, user_id] = bound as [string, string, string];
          const d = db.user_devices.get(id);
          if (d && d.user_id === user_id && d.revoked_at === null) {
            d.revoked_at = revoked_at;
            changes = 1;
          }
        } else if (normalized.startsWith('INSERT INTO student_profiles')) {
          if (bound.length === 2) {
            const [user_id, updated_at] = bound as [string, string];
            db.student_profiles.set(user_id, {
              user_id,
              university_id: 'lnu',
              faculty_id: '1005',
              faculty_name: "Факультет електроніки та комп'ютерних технологій",
              course: 3,
              group_id: 'ФЕП-33с',
              group_name: 'ФЕП-33с',
              subgroup: 1,
              elective_course: 'freelance',
              timezone: 'Europe/Kyiv',
              updated_at,
            });
          } else {
            const [user_id, university_id, faculty_id, faculty_name, course, group_id, group_name, subgroup, elective_course, timezone, updated_at] = bound;
            db.student_profiles.set(user_id as string, {
              user_id,
              university_id,
              faculty_id,
              faculty_name,
              course,
              group_id,
              group_name,
              subgroup,
              elective_course,
              timezone,
              updated_at,
            });
          }
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO rate_limit_buckets')) {
          const [bucket_key, reset_at] = bound as [string, number];
          db.rate_limit_buckets.set(bucket_key, { count: 1, reset_at });
          changes = 1;
        } else if (normalized.startsWith('UPDATE rate_limit_buckets SET count = ?')) {
          const [count, bucket_key] = bound as [number, string];
          const existing = db.rate_limit_buckets.get(bucket_key);
          if (existing) {
            existing.count = count;
            changes = 1;
          }
        } else if (normalized.startsWith('INSERT INTO university_groups')) {
          if (bound.length === 5) {
            const [id, course, group_code, group_name, created_at] = bound;
            const prev = db.university_groups.get(id as string) ?? {};
            db.university_groups.set(id as string, {
              ...prev,
              id,
              university_id: 'lnu',
              course: course ?? prev.course ?? null,
              group_code,
              group_name,
              created_at: prev.created_at ?? created_at,
            });
          } else {
            const [id, university_id, faculty_id, course, group_code, group_name, content_hash, last_synced_at, created_at] = bound;
            const prev = db.university_groups.get(id as string) ?? {};
            db.university_groups.set(id as string, {
              ...prev,
              id,
              university_id,
              faculty_id: faculty_id ?? prev.faculty_id ?? null,
              course: course ?? prev.course ?? null,
              group_code,
              group_name,
              content_hash,
              last_synced_at,
              created_at: prev.created_at ?? created_at,
            });
          }
          changes = 1;
        } else if (normalized.startsWith('DELETE FROM schedule_entries WHERE group_id = ?')) {
          const groupKey = bound[0] as string;
          for (const [k, v] of db.schedule_entries.entries()) {
            if (v.group_id === groupKey) {
              db.schedule_entries.delete(k);
              changes += 1;
            }
          }
        } else if (normalized.startsWith('INSERT INTO schedule_entries')) {
          const [id, group_id, lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time, subject, lesson_type, teacher, room, building, subgroup, is_elective, status, updated_at] = bound;
          db.schedule_entries.set(id as string, {
            id,
            group_id,
            lesson_id,
            lesson_date,
            day_of_week,
            pair_number,
            start_time,
            end_time,
            subject,
            lesson_type,
            teacher,
            room,
            building,
            subgroup,
            is_elective,
            status,
            updated_at,
          });
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO schedule_sync_logs')) {
          const [id, group_id, status, entries_count, error_message, synced_at] = bound;
          db.schedule_sync_logs.push({ id, group_id, status, entries_count, error_message, synced_at });
          changes = 1;
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
    for (const s of statements) {
      out.push(await s.run());
    }
    return out;
  }
}

function makeEnv(db: MockD1Database): Env {
  return {
    DB: db as unknown as D1Database,
    ALLOWED_ORIGINS: 'http://localhost:5173,https://uni-schedule.vercel.app',
    TOKEN_PEPPER: 'test-pepper',
    SCHEDULE_CACHE_TTL_SECONDS: '21600',
    GROUPS_CACHE_TTL_SECONDS: '86400',
  };
}

describe('workers/api Stage 3 endpoints', () => {
  it('enforces CORS allowlist and exposes /api/health', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    const okRes = await worker.fetch(
      new Request('https://api.test/api/health', {
        headers: { Origin: 'https://uni-schedule.vercel.app' },
      }),
      env
    );
    assert.equal(okRes.status, 200);
    assert.equal(okRes.headers.get('Access-Control-Allow-Origin'), 'https://uni-schedule.vercel.app');

    const badRes = await worker.fetch(
      new Request('https://api.test/api/health', {
        headers: { Origin: 'https://evil.example.com' },
      }),
      env
    );
    assert.equal(badRes.status, 403);
  });

  it('registers user with hashed syncToken, prevents IDOR on devices, and supports rotation/revocation', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    // Register User A
    const regA = await worker.fetch(
      new Request('https://api.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'iPhone A' }),
      }),
      env
    );
    assert.equal(regA.status, 201);
    const bodyA = (await regA.json()) as { userId: string; deviceId: string; syncToken: string };
    assert.ok(bodyA.syncToken.startsWith('ust_'));

    // Raw syncToken MUST NOT be stored in D1
    const storedDeviceA = db.user_devices.get(bodyA.deviceId);
    assert.ok(storedDeviceA);
    assert.notEqual(storedDeviceA.token_hash, bodyA.syncToken);
    assert.equal(storedDeviceA.token_hash.length, 64); // SHA-256 hex

    // Register User B
    const regB = await worker.fetch(
      new Request('https://api.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'Laptop B' }),
      }),
      env
    );
    const bodyB = (await regB.json()) as { userId: string; deviceId: string; syncToken: string };

    // IDOR check: User A attempts to revoke User B's device
    const idorRes = await worker.fetch(
      new Request(`https://api.test/api/devices/${bodyB.deviceId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${bodyA.syncToken}` },
      }),
      env
    );
    assert.equal(idorRes.status, 404);
    assert.equal(db.user_devices.get(bodyB.deviceId)?.revoked_at, null);

    // Token rotation invalidates old token immediately
    const rotRes = await worker.fetch(
      new Request('https://api.test/api/devices/rotate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${bodyA.syncToken}` },
      }),
      env
    );
    assert.equal(rotRes.status, 200);
    const rotBody = (await rotRes.json()) as { syncToken: string };
    assert.notEqual(rotBody.syncToken, bodyA.syncToken);

    const oldTokenTry = await worker.fetch(
      new Request('https://api.test/api/profile', {
        headers: { Authorization: `Bearer ${bodyA.syncToken}` },
      }),
      env
    );
    assert.equal(oldTokenTry.status, 401);

    const newTokenTry = await worker.fetch(
      new Request('https://api.test/api/profile', {
        headers: { Authorization: `Bearer ${rotBody.syncToken}` },
      }),
      env
    );
    assert.equal(newTokenTry.status, 200);
  });

  it('validates and isolates student profile updates', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    const reg = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{}' }),
      env
    );
    const { syncToken } = (await reg.json()) as { syncToken: string };

    const invalidTz = await worker.fetch(
      new Request('https://api.test/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncToken}` },
        body: JSON.stringify({ universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', timezone: 'Mars/Olympus' }),
      }),
      env
    );
    assert.equal(invalidTz.status, 400);

    const validUpdate = await worker.fetch(
      new Request('https://api.test/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncToken}` },
        body: JSON.stringify({
          universityId: 'lnu',
          facultyId: '1013',
          course: 3,
          groupId: 'ПМІ-31',
          groupName: 'ПМІ-31',
          subgroup: 2,
          timezone: 'Europe/Kyiv',
        }),
      }),
      env
    );
    assert.equal(validUpdate.status, 200);
    const updated = (await validUpdate.json()) as { profile: { groupName: string; subgroup: number } };
    assert.equal(updated.profile.groupName, 'ПМІ-31');
    assert.equal(updated.profile.subgroup, 2);
  });

  it('caches group schedule in D1 across users and preserves cache on upstream errors', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    const origFetch = globalThis.fetch;
    let upstreamCalls = 0;
    let failUpstream = false;

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('n=701&lev=142')) {
        return new Response(Buffer.from(GROUPS_FIXTURE, 'utf-8'));
      }
      upstreamCalls += 1;
      if (failUpstream) {
        return new Response('Upstream error', { status: 503 });
      }
      return new Response(Buffer.from(HTML_FIXTURE, 'utf-8'));
    }) as typeof fetch;

    try {
      // 1st request hits upstream
      const res1 = await worker.fetch(
        new Request('https://api.test/api/schedule?universityId=lnu&group=%D0%A4%D0%95%D0%9F-33%D1%81'),
        env
      );
      assert.equal(res1.status, 200);
      const data1 = (await res1.json()) as { cacheHit: boolean; schedule: { lessons: unknown[] } };
      assert.equal(data1.cacheHit, false);
      assert.equal(data1.schedule.lessons.length, 6);
      assert.equal(upstreamCalls, 1);

      // 2nd request serves shared D1 cache (0 new upstream calls)
      const res2 = await worker.fetch(
        new Request('https://api.test/api/schedule?universityId=lnu&group=%D0%A4%D0%95%D0%9F-33%D1%81'),
        env
      );
      assert.equal(res2.status, 200);
      const data2 = (await res2.json()) as { cacheHit: boolean; schedule: { lessons: unknown[] } };
      assert.equal(data2.cacheHit, true);
      assert.equal(data2.schedule.lessons.length, 6);
      assert.equal(upstreamCalls, 1);

      // Force refresh when upstream fails preserves valid cached schedule
      failUpstream = true;
      const res3 = await worker.fetch(
        new Request('https://api.test/api/schedule?universityId=lnu&group=%D0%A4%D0%95%D0%9F-33%D1%81&force=1'),
        env
      );
      assert.equal(res3.status, 200);
      const data3 = (await res3.json()) as { cacheHit: boolean; stale: boolean; schedule: { lessons: unknown[]; warnings: string[] } };
      assert.equal(data3.stale, true);
      assert.equal(data3.schedule.lessons.length, 6);
      assert.ok(data3.schedule.warnings.length > 0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('enforces D1 rate limiting (429 Too Many Requests)', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    let lastStatus = 200;
    for (let i = 0; i < 21; i += 1) {
      const res = await worker.fetch(
        new Request('https://api.test/api/auth/register', {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '198.51.100.10' },
          body: '{}',
        }),
        env
      );
      lastStatus = res.status;
    }
    assert.equal(lastStatus, 429);
  });
});
