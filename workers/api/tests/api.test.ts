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
  public push_subscriptions = new Map<string, Record<string, unknown>>();
  public notification_preferences = new Map<string, Record<string, unknown>>();
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
        } else if (normalized === 'SELECT 1 AS ok') {
          results = [{ ok: 1 }];
        } else if (normalized.startsWith('INSERT INTO rate_limit_buckets') && normalized.includes('RETURNING count, reset_at')) {
          const [bucket_key, next_reset_at, now_sec] = bound as [string, number, number];
          const existing = db.rate_limit_buckets.get(bucket_key);
          if (!existing || existing.reset_at <= now_sec) {
            const next = { count: 1, reset_at: next_reset_at };
            db.rate_limit_buckets.set(bucket_key, next);
            results = [next];
          } else {
            existing.count += 1;
            results = [{ count: existing.count, reset_at: existing.reset_at }];
          }
        } else if (normalized.startsWith('SELECT count, reset_at FROM rate_limit_buckets')) {
          const key = bound[0] as string;
          const bucket = db.rate_limit_buckets.get(key);
          if (bucket) results = [bucket];
        } else if (normalized.startsWith('SELECT user_id, university_id')) {
          const userId = bound[0] as string;
          const prof = db.student_profiles.get(userId);
          if (prof) results = [prof];
        } else if (normalized.startsWith('SELECT revision, source_mode FROM student_profiles WHERE user_id = ?')) {
          const prof = db.student_profiles.get(bound[0] as string);
          if (prof) results = [{ revision: prof.revision ?? 0, source_mode: prof.source_mode ?? 'live' }];
        } else if (normalized.startsWith('SELECT revision FROM student_profiles WHERE user_id = ?')) {
          const prof = db.student_profiles.get(bound[0] as string);
          if (prof) results = [{ revision: prof.revision ?? 0 }];
        } else if (normalized.startsWith('SELECT id FROM universities WHERE id = ?')) {
          const id = bound[0] as string;
          const uni = db.universities.get(id);
          if (uni) results = [{ id: uni.id }];
        } else if (normalized.startsWith('SELECT id, name, short_name, city, support_status, source_url FROM universities')) {
          results = Array.from(db.universities.values());
        } else if (normalized.startsWith('SELECT COUNT(*) as total FROM university_groups')) {
          const uniId = bound[0] as string;
          const total = Array.from(db.university_groups.values()).filter((g) => g.university_id === uniId).length;
          results = [{ total }];
        } else if (normalized.startsWith('SELECT synced_at, entries_count FROM schedule_sync_logs')) {
          const groupId = bound[0] as string;
          const matches = db.schedule_sync_logs
            .filter((l) => l.group_id === groupId && l.status === 'success')
            .sort((a, b) => String(b.synced_at).localeCompare(String(a.synced_at)));
          if (matches[0]) {
            results = [{ synced_at: matches[0].synced_at, entries_count: matches[0].entries_count }];
          }
        } else if (normalized.startsWith('SELECT user_id, enabled, morning_enabled')) {
          const userId = bound[0] as string;
          const pref = db.notification_preferences.get(userId);
          if (pref) results = [pref];
        } else if (normalized.startsWith('SELECT MAX(created_at) as newest_at, COUNT(*) as total FROM university_groups')) {
          const uniId = bound[0] as string;
          const rows = Array.from(db.university_groups.values()).filter((g) => g.university_id === uniId);
          const newest = rows.reduce<string | null>((acc, g) => {
            const c = g.created_at as string;
            return !acc || c > acc ? c : acc;
          }, null);
          results = [{ newest_at: newest, total: rows.length }];
        } else if ((normalized.startsWith('SELECT group_code, group_name, course') || normalized.startsWith('SELECT id, faculty_id, group_name, last_synced_at'))) {
          results = Array.from(db.university_groups.values()).filter((g) => g.university_id === 'lnu');
        } else if (normalized.startsWith('SELECT id, faculty_id, last_synced_at, content_hash, schedule_source_type, covered_from, covered_to FROM university_groups WHERE id = ?')) {
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
          const [user_id, university_id, faculty_id, faculty_name, course, group_id, group_name, subgroup, elective_course, timezone, updated_at, department, selected_electives, selected_track, source_mode, expected_revision] = bound;
          const previous = db.student_profiles.get(user_id as string);
          if (!previous || previous.revision === expected_revision) {
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
              department,
              selected_electives,
              selected_track,
              source_mode,
              revision: (previous?.revision as number ?? 0) + 1,
            });
            changes = 1;
          }
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
        } else if (normalized.startsWith('INSERT OR IGNORE INTO university_groups')) {
          const [id, university_id, faculty_id, course, group_code, group_name, created_at] = bound;
          if (!db.university_groups.has(id as string)) {
            db.university_groups.set(id as string, {
              id, university_id, faculty_id, course, group_code, group_name,
              content_hash: null, last_synced_at: null, created_at,
              schedule_source_type: null, covered_from: null, covered_to: null,
            });
            changes = 1;
          }
        } else if (normalized.startsWith('UPDATE university_groups SET faculty_id')) {
          const [faculty_id, course, content_hash, last_synced_at, schedule_source_type, covered_from, covered_to, id] = bound;
          const prev = db.university_groups.get(id as string);
          if (prev) {
            db.university_groups.set(id as string, {
              ...prev,
              faculty_id: faculty_id ?? prev.faculty_id,
              course: course ?? prev.course,
              content_hash,
              last_synced_at,
              schedule_source_type,
              covered_from,
              covered_to,
            });
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
          } else if (bound.length === 6) {
            const [id, faculty_id, course, group_code, group_name, created_at] = bound;
            const prev = db.university_groups.get(id as string) ?? {};
            db.university_groups.set(id as string, {
              ...prev,
              id,
              university_id: 'lnu',
              faculty_id: faculty_id ?? prev.faculty_id ?? null,
              course: course ?? prev.course ?? null,
              group_code,
              group_name,
              created_at: prev.created_at ?? created_at,
            });
          } else {
            const [id, university_id, faculty_id, course, group_code, group_name, content_hash, last_synced_at, created_at, schedule_source_type, covered_from, covered_to] = bound;
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
              schedule_source_type,
              covered_from,
              covered_to,
              created_at: prev.created_at ?? created_at,
            });
          }
          changes = 1;
        } else if (normalized.startsWith('DELETE FROM schedule_entries WHERE group_id = ? AND updated_at != ?')) {
          const [groupKey, keepUpdatedAt] = bound as [string, string];
          for (const [k, v] of db.schedule_entries.entries()) {
            if (v.group_id === groupKey && v.updated_at !== keepUpdatedAt) {
              db.schedule_entries.delete(k);
              changes += 1;
            }
          }
        } else if (normalized.startsWith('DELETE FROM schedule_entries WHERE group_id = ? AND updated_at = ?')) {
          const [groupKey, dropUpdatedAt] = bound as [string, string];
          for (const [k, v] of db.schedule_entries.entries()) {
            if (v.group_id === groupKey && v.updated_at === dropUpdatedAt) {
              db.schedule_entries.delete(k);
              changes += 1;
            }
          }
        } else if (normalized.startsWith('DELETE FROM schedule_entries WHERE group_id = ?')) {
          const groupKey = bound[0] as string;
          for (const [k, v] of db.schedule_entries.entries()) {
            if (v.group_id === groupKey) {
              db.schedule_entries.delete(k);
              changes += 1;
            }
          }
        } else if (normalized.startsWith('INSERT INTO schedule_entries')) {
          const [id, group_id, lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time, subject, lesson_type, teacher, room, building, subgroup, is_elective, status, updated_at, elective_key = null, track_number = null, week_type = null, group_label = null] = bound;
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
            elective_key,
            week_type,
            group_label,
            track_number,
            updated_at,
          });
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO schedule_sync_logs')) {
          if (normalized.includes("'success'")) {
            const [id, group_id, entries_count, synced_at] = bound;
            db.schedule_sync_logs.push({
              id,
              group_id,
              status: 'success',
              entries_count,
              error_message: null,
              synced_at,
            });
          } else if (normalized.includes("'skipped'")) {
            const [id, group_id, error_message, synced_at] = bound;
            db.schedule_sync_logs.push({
              id,
              group_id,
              status: 'skipped',
              entries_count: 0,
              error_message,
              synced_at,
            });
          } else if (normalized.includes("'error'")) {
            const [id, group_id, error_message, synced_at] = bound;
            db.schedule_sync_logs.push({
              id,
              group_id,
              status: 'error',
              entries_count: 0,
              error_message,
              synced_at,
            });
          } else {
            const [id, group_id, status, entries_count, error_message, synced_at] = bound;
            db.schedule_sync_logs.push({ id, group_id, status, entries_count, error_message, synced_at });
          }
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO push_subscriptions')) {
          const [id, user_id, device_id, endpoint, p256dh, auth, user_agent, created_at] = bound;
          db.push_subscriptions.set(endpoint as string, {
            id,
            user_id,
            device_id,
            endpoint,
            p256dh,
            auth,
            user_agent,
            created_at,
          });
          changes = 1;
        } else if (normalized.startsWith('INSERT INTO notification_preferences')) {
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
            };
            db.notification_preferences.set(user_id as string, { ...prev, user_id, enabled: 1, updated_at });
          } else {
            const [
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
              updated_at,
            ] = bound;
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
              updated_at,
            });
          }
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
    if (!storedDeviceA) throw new Error('Expected storedDeviceA');
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
    assert.equal(newTokenTry.status, 404); // Registration no longer invents an academic profile.
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
          sourceMode: 'live',
          expectedRevision: 0,
        }),
      }),
      env
    );
    assert.equal(validUpdate.status, 200);
    const updated = (await validUpdate.json()) as { profile: { groupName: string; subgroup: number } };
    assert.equal(updated.profile.groupName, 'ПМІ-31');
    assert.equal(updated.profile.subgroup, 2);
  });

  it('acknowledges built-in transitions and rejects stale profile writes', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);
    const reg = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{}' }), env
    );
    const { syncToken } = (await reg.json()) as { syncToken: string };
    const put = (body: Record<string, unknown>) => worker.fetch(
      new Request('https://api.test/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${syncToken}` },
        body: JSON.stringify(body),
      }), env
    );

    const live = await put({ sourceMode: 'live', universityId: 'lnu',
      groupId: 'ІН-31', groupName: 'ІН-31', expectedRevision: 0 });
    assert.equal(live.status, 200);
    const liveBody = await live.json() as { profile: { revision: number } };
    assert.equal(liveBody.profile.revision, 1);

    const builtin = await put({ sourceMode: 'builtin', expectedRevision: 1 });
    assert.equal(builtin.status, 200);
    const builtinBody = await builtin.json() as { profile: { sourceMode: string; revision: number } };
    assert.equal(builtinBody.profile.sourceMode, 'builtin');
    assert.equal(builtinBody.profile.revision, 2);

    const stale = await put({ sourceMode: 'live', universityId: 'lnu',
      groupId: 'ІН-31', groupName: 'ІН-31', expectedRevision: 1 });
    assert.equal(stale.status, 409);
    const conflict = await stale.json() as { revision: number };
    assert.equal(conflict.revision, 2);
    const current = await worker.fetch(new Request('https://api.test/api/profile', {
      headers: { Authorization: `Bearer ${syncToken}` },
    }), env);
    const currentBody = await current.json() as { profile: { sourceMode: string; revision: number } };
    assert.equal(currentBody.profile.sourceMode, 'builtin');
    assert.equal(currentBody.profile.revision, 2);
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
      const data1 = (await res1.json()) as {
        cacheHit: boolean;
        schedule: {
          lessons: unknown[];
          sourceType?: string;
          coveredFrom?: string;
          coveredTo?: string;
        };
      };
      assert.equal(data1.cacheHit, false);
      assert.equal(data1.schedule.lessons.length, 6);
      assert.equal(upstreamCalls, 1);
      assert.equal(data1.schedule.sourceType, 'dated');
      assert.match(data1.schedule.coveredFrom ?? '', /^\d{4}-\d{2}-\d{2}$/);
      assert.match(data1.schedule.coveredTo ?? '', /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(data1.schedule.coveredFrom! <= data1.schedule.coveredTo!);

      // Verify coverage fields persisted in MockD1Database (0006_schedule_coverage.sql)
      const persistedGroup = db.university_groups.get('lnu:ФЕП-33с');
      assert.ok(persistedGroup);
      assert.equal(persistedGroup.schedule_source_type, data1.schedule.sourceType);
      assert.equal(persistedGroup.covered_from, data1.schedule.coveredFrom);
      assert.equal(persistedGroup.covered_to, data1.schedule.coveredTo);

      // 2nd request serves shared D1 cache (0 new upstream calls)
      const res2 = await worker.fetch(
        new Request('https://api.test/api/schedule?universityId=lnu&group=%D0%A4%D0%95%D0%9F-33%D1%81'),
        env
      );
      assert.equal(res2.status, 200);
      const data2 = (await res2.json()) as {
        cacheHit: boolean;
        schedule: {
          lessons: unknown[];
          sourceType?: string;
          coveredFrom?: string;
          coveredTo?: string;
        };
      };
      assert.equal(data2.cacheHit, true);
      assert.equal(data2.schedule.lessons.length, 6);
      assert.equal(upstreamCalls, 1);
      assert.equal(data2.schedule.sourceType, data1.schedule.sourceType);
      assert.equal(data2.schedule.coveredFrom, data1.schedule.coveredFrom);
      assert.equal(data2.schedule.coveredTo, data1.schedule.coveredTo);

      // Force refresh when upstream fails preserves valid cached schedule
      failUpstream = true;
      const res3 = await worker.fetch(
        new Request('https://api.test/api/schedule?universityId=lnu&group=%D0%A4%D0%95%D0%9F-33%D1%81&force=1'),
        env
      );
      assert.equal(res3.status, 200);
      const data3 = (await res3.json()) as {
        cacheHit: boolean;
        stale: boolean;
        schedule: {
          lessons: unknown[];
          warnings: string[];
          sourceType?: string;
          coveredFrom?: string;
          coveredTo?: string;
        };
      };
      assert.equal(data3.stale, true);
      assert.equal(data3.schedule.lessons.length, 6);
      assert.ok(data3.schedule.warnings.length > 0);
      assert.equal(data3.schedule.sourceType, data1.schedule.sourceType);
      assert.equal(data3.schedule.coveredFrom, data1.schedule.coveredFrom);
      assert.equal(data3.schedule.coveredTo, data1.schedule.coveredTo);
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

  it('returns 405 METHOD_NOT_ALLOWED with Allow header before auth, and 404 for unknown routes', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    const reg = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{}' }),
      env
    );
    const { syncToken } = (await reg.json()) as { syncToken: string };

    const checks: Array<{ method: string; path: string; allow: string; auth?: boolean }> = [
      { method: 'POST', path: '/api/health', allow: 'GET' },
      { method: 'GET', path: '/api/auth/register', allow: 'POST' },
      { method: 'POST', path: '/api/universities', allow: 'GET' },
      { method: 'DELETE', path: '/api/profile', allow: 'GET, PUT' },
      { method: 'DELETE', path: '/api/profile', allow: 'GET, PUT', auth: true },
      { method: 'GET', path: '/api/devices/link', allow: 'POST' },
      { method: 'DELETE', path: '/api/devices/link', allow: 'POST', auth: true },
      { method: 'DELETE', path: '/api/devices/rotate', allow: 'POST', auth: true },
      { method: 'PUT', path: '/api/devices/dev-123', allow: 'DELETE' },
      { method: 'POST', path: '/api/push/subscriptions/sub-123', allow: 'DELETE' },
      { method: 'DELETE', path: '/api/notifications/preferences', allow: 'GET, PUT' },
      { method: 'GET', path: '/api/attendance/sync', allow: 'POST' },
    ];

    for (const c of checks) {
      const res = await worker.fetch(
        new Request(`https://api.test${c.path}`, {
          method: c.method,
          headers: c.auth ? { Authorization: `Bearer ${syncToken}` } : {},
        }),
        env
      );
      assert.equal(res.status, 405, `Expected 405 for ${c.method} ${c.path}`);
      assert.equal(res.headers.get('Allow'), c.allow);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, 'METHOD_NOT_ALLOWED');
    }

    const unknownRes = await worker.fetch(new Request('https://api.test/api/does-not-exist'), env);
    assert.equal(unknownRes.status, 404);

    const unauthRes = await worker.fetch(new Request('https://api.test/api/profile'), env);
    assert.equal(unauthRes.status, 401);
  });

  it('strictly rejects invalid profile and push/preferences payloads with 400 and preserves partial preferences', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    const reg = await worker.fetch(
      new Request('https://api.test/api/auth/register', { method: 'POST', body: '{}' }),
      env
    );
    const { syncToken } = (await reg.json()) as { syncToken: string };
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${syncToken}` };

    const badProfiles: unknown[] = [
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', subgroup: 3 },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', subgroup: '2' },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', subgroup: null },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', electiveCourse: 'invalid' },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', timezone: '' },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', timezone: 123 },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', facultyId: 123 },
      { universityId: 'lnu', groupId: 'ПМІ-31', groupName: 'ПМІ-31', facultyName: '   ' },
    ];

    for (const payload of badProfiles) {
      const res = await worker.fetch(
        new Request('https://api.test/api/profile', {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload),
        }),
        env
      );
      assert.equal(res.status, 400, `Expected 400 for profile payload ${JSON.stringify(payload)}`);
    }

    // Push subscription rejects endpoint > 2048 and non-object keys
    const longEndpoint = `https://push.test/${'a'.repeat(2040)}`;
    const badLongSub = await worker.fetch(
      new Request('https://api.test/api/push/subscriptions', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ endpoint: longEndpoint, keys: { p256dh: 'abc', auth: 'def' } }),
      }),
      env
    );
    assert.equal(badLongSub.status, 400);

    const badArrayKeysSub = await worker.fetch(
      new Request('https://api.test/api/push/subscriptions', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ endpoint: 'https://push.test/ok', keys: ['bad'] }),
      }),
      env
    );
    assert.equal(badArrayKeysSub.status, 400);

    // Notification preferences strict 400 validation
    const badPrefs: unknown[] = [
      { enabled: 'yes' },
      { morningTime: '25:99' },
      { morningTime: '8:00' },
      { beforeLessonMinutes: 45 },
      { beforeEndMinutes: 30 },
      { eveningTime: 'invalid' },
      { fridayEnabled: 1 },
    ];
    for (const payload of badPrefs) {
      const res = await worker.fetch(
        new Request('https://api.test/api/notifications/preferences', {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(payload),
        }),
        env
      );
      assert.equal(res.status, 400, `Expected 400 for preferences payload ${JSON.stringify(payload)}`);
    }

    // Full save followed by partial PUT preserves prior fields
    const saveFull = await worker.fetch(
      new Request('https://api.test/api/notifications/preferences', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          enabled: true,
          morningEnabled: false,
          morningTime: '07:15',
          beforeLessonMinutes: 30,
          fridayTime: '17:45',
        }),
      }),
      env
    );
    assert.equal(saveFull.status, 200);

    const partialPut = await worker.fetch(
      new Request('https://api.test/api/notifications/preferences', {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({ morningTime: '07:30' }),
      }),
      env
    );
    assert.equal(partialPut.status, 200);
    const partialData = (await partialPut.json()) as {
      preferences: {
        enabled: boolean;
        morningEnabled: boolean;
        morningTime: string;
        beforeLessonMinutes: number;
        fridayTime: string;
      };
    };
    assert.equal(partialData.preferences.enabled, true);
    assert.equal(partialData.preferences.morningEnabled, false);
    assert.equal(partialData.preferences.morningTime, '07:30');
    assert.equal(partialData.preferences.beforeLessonMinutes, 30);
    assert.equal(partialData.preferences.fridayTime, '17:45');
  });

  it('tracks groups directory freshness via lnu:__directory__ and expires adapter memory cache', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);
    env.GROUPS_CACHE_TTL_SECONDS = '1';

    // Pre-populate 6 groups directly via university_groups (simulating 6 /api/schedule calls)
    for (let i = 1; i <= 6; i += 1) {
      db.university_groups.set(`lnu:SCHED-${i}`, {
        id: `lnu:SCHED-${i}`,
        university_id: 'lnu',
        course: 1,
        group_code: `SCHED-${i}`,
        group_name: `SCHED-${i}`,
        created_at: new Date().toISOString(),
      });
    }

    const origFetch = globalThis.fetch;
    let groupCalls = 0;
    let dynamicGroupName = 'PMI-41';
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      if (urlStr.includes('n=701&lev=142')) {
        groupCalls += 1;
        const payload = JSON.stringify({
          query: '',
          suggestions: ['ABL-11', 'FEP-11', 'FEP-21', 'FEP-33', dynamicGroupName],
        });
        return new Response(Buffer.from(payload, 'utf-8'));
      }
      return new Response('Not found', { status: 404 });
    }) as typeof fetch;

    try {
      // Invalid ?course=9 returns 400
      const badCourseRes = await worker.fetch(
        new Request('https://api.test/api/universities/lnu/groups?course=9'),
        env
      );
      assert.equal(badCourseRes.status, 400);

      // Even with 6 pre-populated groups, directory sync still runs because lnu:__directory__ has no log
      const res1 = await worker.fetch(
        new Request('https://api.test/api/universities/lnu/groups'),
        env
      );
      assert.equal(res1.status, 200);
      assert.equal(groupCalls, 1);

      // Immediate 2nd request with 5 fixture groups uses D1 cache (0 extra upstream calls)
      const res2 = await worker.fetch(
        new Request('https://api.test/api/universities/lnu/groups'),
        env
      );
      assert.equal(res2.status, 200);
      assert.equal(groupCalls, 1);

      // Simulate TTL expiry (> 1s)
      const dirLog = db.schedule_sync_logs.find((l) => l.group_id === 'lnu:__directory__');
      assert.ok(dirLog);
      dirLog!.synced_at = new Date(Date.now() - 5000).toISOString();
      dynamicGroupName = 'PMI-42';

      const res3 = await worker.fetch(
        new Request('https://api.test/api/universities/lnu/groups'),
        env
      );
      assert.equal(res3.status, 200);
      assert.equal(groupCalls, 2);
      const data3 = (await res3.json()) as { groups: Array<{ name: string }> };
      assert.ok(data3.groups.some((g) => g.name === 'PMI-42'));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('Phase E: rejects unsafe push endpoints, invalid p256dh/auth lengths, and missing required TOKEN_PEPPER', async () => {
    const db = new MockD1Database();
    const env = makeEnv(db);

    const reg = await worker.fetch(
      new Request('https://api.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'PhaseE Phone' }),
      }),
      env
    );
    assert.equal(reg.status, 201);
    const { syncToken } = (await reg.json()) as { syncToken: string };

    // 1. SSRF / non-HTTPS push endpoint rejected
    const ssrfRes = await worker.fetch(
      new Request('https://api.test/api/push/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${syncToken}`,
        },
        body: JSON.stringify({
          subscription: {
            endpoint: 'http://127.0.0.1:8080/push',
            keys: {
              p256dh: Buffer.alloc(65, 4).toString('base64url'),
              auth: Buffer.alloc(16, 2).toString('base64url'),
            },
          },
        }),
      }),
      env
    );
    assert.equal(ssrfRes.status, 400);

    // 2. Invalid p256dh byte length rejected
    const badKeyRes = await worker.fetch(
      new Request('https://api.test/api/push/subscriptions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${syncToken}`,
        },
        body: JSON.stringify({
          subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/phase-e-valid',
            keys: {
              p256dh: Buffer.alloc(32, 4).toString('base64url'),
              auth: Buffer.alloc(16, 2).toString('base64url'),
            },
          },
        }),
      }),
      env
    );
    assert.equal(badKeyRes.status, 400);

    // 3. Missing TOKEN_PEPPER when REQUIRE_TOKEN_PEPPER='true' throws/500s cleanly
    const strictEnv = { ...env, REQUIRE_TOKEN_PEPPER: 'true', TOKEN_PEPPER: undefined } as unknown as Env;
    const strictRes = await worker.fetch(
      new Request('https://api.test/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceName: 'FailClosed' }),
      }),
      strictEnv
    );
    assert.equal(strictRes.status, 500);
  });
});
