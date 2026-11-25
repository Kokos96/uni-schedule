import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_DIR = path.resolve(__dirname, '..');
const WRANGLER_BIN = path.join(WORKER_DIR, 'node_modules', '.bin', 'wrangler');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 8791;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

function runWrangler(args) {
  return execFileSync(WRANGLER_BIN, args, {
    cwd: WORKER_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function logMatrix(method, pathname, scenario, status, codeOrOk) {
  console.log(`[MATRIX] ${method} ${pathname} | ${scenario} -> ${status} (${codeOrOk})`);
}

async function apiFetch(baseUrl, pathname, options = {}) {
  const { method = 'GET', token, headers = {}, body } = options;
  const finalHeaders = { ...headers };
  if (token) {
    finalHeaders.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined && !finalHeaders['Content-Type']) {
    finalHeaders['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, headers: res.headers, json, text };
}

describe('workers/api Real Local Worker HTTP Matrix (20 endpoints x 6 scenarios)', () => {
  let tmpPersistDir = '';
  let wranglerProc = null;
  let baseUrl = '';
  let wranglerLogs = '';

  const resetRateLimits = () => {
    runWrangler([
      'd1',
      'execute',
      'uni-schedule-db',
      '--local',
      '--persist-to',
      tmpPersistDir,
      '--command',
      'DELETE FROM rate_limit_buckets;',
    ]);
  };

  before(async () => {
    tmpPersistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rozklad-m1-d1-'));

    // Apply 0001-0004 migrations onto isolated local D1
    runWrangler([
      'd1',
      'migrations',
      'apply',
      'uni-schedule-db',
      '--local',
      '--persist-to',
      tmpPersistDir,
    ]);

    // Seed deterministic LNU directory & schedule cache rows so tests work offline
    const seedSql = `
      INSERT INTO university_groups (id, university_id, faculty_id, course, group_code, group_name, content_hash, last_synced_at, created_at)
      VALUES
        ('lnu:АБЛБ-1с', 'lnu', NULL, 1, 'АБЛБ-1с', 'АБЛБ-1с', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        ('lnu:ФЕП-11с', 'lnu', NULL, 1, 'ФЕП-11с', 'ФЕП-11с', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        ('lnu:ФЕП-21с', 'lnu', NULL, 2, 'ФЕП-21с', 'ФЕП-21с', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        ('lnu:ФЕП-33с', 'lnu', '1005', 3, 'ФЕП-33с', 'ФЕП-33с', 'seed-hash', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        ('lnu:ПМІ-41', 'lnu', NULL, 4, 'ПМІ-41', 'ПМІ-41', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

      INSERT INTO schedule_entries (id, group_id, lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time, subject, lesson_type, teacher, room, building, subgroup, is_elective, status, updated_at)
      VALUES
        ('seed-se-1', 'lnu:ФЕП-33с', 'seed-lesson-1', '2026-11-18', 3, 1, '08:30', '09:50', 'Веб-програмування', 'Лекція', 'Іванов І.І.', '214', 'Головний', NULL, 0, 'active', strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
        ('seed-se-2', 'lnu:ФЕП-33с', 'seed-lesson-2', '2026-11-18', 3, 2, '10:10', '11:30', 'Бази даних', 'Лабораторна', 'Петров П.П.', '105', 'Головний', 1, 0, 'active', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

      INSERT INTO schedule_sync_logs (id, group_id, status, entries_count, error_message, synced_at)
      VALUES ('seed-dir-log', 'lnu:__directory__', 'success', 5, NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));
    `;

    runWrangler([
      'd1',
      'execute',
      'uni-schedule-db',
      '--local',
      '--persist-to',
      tmpPersistDir,
      '--command',
      seedSql,
    ]);

    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    wranglerProc = spawn(
      WRANGLER_BIN,
      ['dev', '--local', '--port', String(port), '--persist-to', tmpPersistDir],
      {
        cwd: WORKER_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );

    wranglerProc.stdout.on('data', (chunk) => {
      wranglerLogs += chunk.toString('utf8');
    });
    wranglerProc.stderr.on('data', (chunk) => {
      wranglerLogs += chunk.toString('utf8');
    });

    const deadline = Date.now() + 30000;
    let healthy = false;
    while (Date.now() < deadline) {
      if (wranglerProc.exitCode !== null) {
        throw new Error(`wrangler dev exited early (${wranglerProc.exitCode}): ${wranglerLogs.slice(-1000)}`);
      }
      try {
        const res = await fetch(`${baseUrl}/api/health`);
        if (res.status === 200) {
          healthy = true;
          break;
        }
      } catch {
        // Still starting
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!healthy) {
      throw new Error(`Timed out waiting for wrangler dev on ${baseUrl}. Logs: ${wranglerLogs.slice(-1000)}`);
    }
  });

  after(async () => {
    if (wranglerProc && wranglerProc.exitCode === null) {
      wranglerProc.kill('SIGTERM');
      await new Promise((resolve) => {
        const timer = setTimeout(() => {
          if (wranglerProc && wranglerProc.exitCode === null) {
            wranglerProc.kill('SIGKILL');
          }
          resolve();
        }, 3000);
        wranglerProc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
    if (tmpPersistDir) {
      fs.rmSync(tmpPersistDir, { recursive: true, force: true });
    }
  });

  it('verifies all 20 endpoints across 6 scenarios + rate limiting without token leaks', async () => {
    // 1. GET /api/health
    {
      const ok = await apiFetch(baseUrl, '/api/health', { headers: { Origin: 'http://localhost:5173' } });
      assert.equal(ok.status, 200);
      assert.equal(ok.json?.ok, true);
      logMatrix('GET', '/api/health', 'success', ok.status, 'ok');

      const badOrigin = await apiFetch(baseUrl, '/api/health', { headers: { Origin: 'https://evil.example' } });
      assert.equal(badOrigin.status, 403);
      logMatrix('GET', '/api/health', 'forbidden_origin', badOrigin.status, badOrigin.json?.error?.code);

      const wrongMethod = await apiFetch(baseUrl, '/api/health', { method: 'POST' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('POST', '/api/health', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 2. GET /api/push/vapid-public-key
    {
      const ok = await apiFetch(baseUrl, '/api/push/vapid-public-key');
      assert.equal(ok.status, 200);
      assert.ok(typeof ok.json?.publicKey === 'string' && ok.json.publicKey.length > 20);
      logMatrix('GET', '/api/push/vapid-public-key', 'success', ok.status, 'ok');

      const foreignTok = await apiFetch(baseUrl, '/api/push/vapid-public-key', { token: 'ust_foreign_unused_token_123456' });
      assert.equal(foreignTok.status, 200);
      logMatrix('GET', '/api/push/vapid-public-key', 'public_with_token', foreignTok.status, 'ok');

      const wrongMethod = await apiFetch(baseUrl, '/api/push/vapid-public-key', { method: 'POST' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('POST', '/api/push/vapid-public-key', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 3. GET /api/universities
    {
      const ok = await apiFetch(baseUrl, '/api/universities');
      assert.equal(ok.status, 200);
      assert.ok(Array.isArray(ok.json?.universities));
      assert.ok(ok.json.universities.some((u) => u.id === 'lnu'));
      assert.ok(ok.json.universities.some((u) => u.id === 'other'));
      logMatrix('GET', '/api/universities', 'success', ok.status, 'ok');

      const wrongMethod = await apiFetch(baseUrl, '/api/universities', { method: 'DELETE' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('DELETE', '/api/universities', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 4. GET /api/universities/:uniId/faculties
    {
      const lnu = await apiFetch(baseUrl, '/api/universities/lnu/faculties');
      assert.equal(lnu.status, 200);
      assert.ok(Array.isArray(lnu.json?.faculties) && lnu.json.faculties.length > 0);
      logMatrix('GET', '/api/universities/lnu/faculties', 'success', lnu.status, 'ok');

      const other = await apiFetch(baseUrl, '/api/universities/other/faculties');
      assert.equal(other.status, 200);
      assert.deepEqual(other.json?.faculties, []);

      const unknown = await apiFetch(baseUrl, '/api/universities/unknown/faculties');
      assert.equal(unknown.status, 404);
      logMatrix('GET', '/api/universities/unknown/faculties', 'unknown_uni', unknown.status, unknown.json?.error?.code);

      const wrongMethod = await apiFetch(baseUrl, '/api/universities/lnu/faculties', { method: 'POST' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('POST', '/api/universities/lnu/faculties', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 5. GET /api/universities/:uniId/groups
    {
      const lnu = await apiFetch(baseUrl, '/api/universities/lnu/groups');
      assert.equal(lnu.status, 200);
      assert.equal(lnu.json?.groups?.length, 5);
      logMatrix('GET', '/api/universities/lnu/groups', 'success', lnu.status, 'ok');

      const other = await apiFetch(baseUrl, '/api/universities/other/groups');
      assert.equal(other.status, 200);
      assert.deepEqual(other.json?.groups, []);

      const badCourse = await apiFetch(baseUrl, '/api/universities/lnu/groups?course=9');
      assert.equal(badCourse.status, 400);
      logMatrix('GET', '/api/universities/lnu/groups?course=9', 'invalid_course', badCourse.status, badCourse.json?.error?.code);

      const unknown = await apiFetch(baseUrl, '/api/universities/unknown/groups');
      assert.equal(unknown.status, 404);

      const wrongMethod = await apiFetch(baseUrl, '/api/universities/lnu/groups', { method: 'PUT' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('PUT', '/api/universities/lnu/groups', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 6. GET /api/schedule
    {
      const ok = await apiFetch(baseUrl, '/api/schedule?universityId=lnu&group=%D0%A4%D0%95%D0%9F-33%D1%81');
      assert.equal(ok.status, 200);
      assert.equal(ok.json?.cacheHit, true);
      assert.equal(ok.json?.schedule?.lessons?.length, 2);
      logMatrix('GET', '/api/schedule', 'success_cache_hit', ok.status, 'ok');

      const missingGroup = await apiFetch(baseUrl, '/api/schedule?universityId=lnu');
      assert.equal(missingGroup.status, 400);
      logMatrix('GET', '/api/schedule', 'missing_group', missingGroup.status, missingGroup.json?.error?.code);

      const otherUni = await apiFetch(baseUrl, '/api/schedule?universityId=other&group=G1');
      assert.equal(otherUni.status, 400);

      const badUni = await apiFetch(baseUrl, '/api/schedule?universityId=bad&group=G1');
      assert.equal(badUni.status, 404);

      const wrongMethod = await apiFetch(baseUrl, '/api/schedule', { method: 'POST' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('POST', '/api/schedule', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    resetRateLimits();

    // 7. POST /api/auth/register (User A and User B)
    let userIdA = '';
    let tokenA = '';
    let userIdB = '';
    let tokenB = '';
    {
      const regA = await apiFetch(baseUrl, '/api/auth/register', { method: 'POST', body: { deviceName: 'Device A1' } });
      assert.equal(regA.status, 201);
      assert.ok(regA.json?.userId && regA.json?.deviceId && regA.json?.syncToken);
      userIdA = regA.json.userId;
      tokenA = regA.json.syncToken;
      logMatrix('POST', '/api/auth/register', 'success_userA', regA.status, 'ok');

      const regB = await apiFetch(baseUrl, '/api/auth/register', { method: 'POST', body: { deviceName: 'Device B1' } });
      assert.equal(regB.status, 201);
      userIdB = regB.json.userId;
      tokenB = regB.json.syncToken;
      assert.notEqual(userIdB, userIdA);
      logMatrix('POST', '/api/auth/register', 'success_userB', regB.status, 'ok');

      const badJson = await apiFetch(baseUrl, '/api/auth/register', { method: 'POST', body: '{bad' });
      assert.equal(badJson.status, 400);
      logMatrix('POST', '/api/auth/register', 'invalid_json', badJson.status, badJson.json?.error?.code);

      const arrayBody = await apiFetch(baseUrl, '/api/auth/register', { method: 'POST', body: [] });
      assert.equal(arrayBody.status, 400);

      const wrongMethod = await apiFetch(baseUrl, '/api/auth/register', { method: 'GET' });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'POST');
      logMatrix('GET', '/api/auth/register', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 8. GET /api/devices
    {
      const noAuth = await apiFetch(baseUrl, '/api/devices');
      assert.equal(noAuth.status, 401);
      logMatrix('GET', '/api/devices', 'no_auth', noAuth.status, noAuth.json?.error?.code);

      const badAuth = await apiFetch(baseUrl, '/api/devices', { token: 'ust_invalid_token_1234567890' });
      assert.equal(badAuth.status, 401);

      const okA = await apiFetch(baseUrl, '/api/devices', { token: tokenA });
      assert.equal(okA.status, 200);
      assert.equal(okA.json?.devices?.length, 1);
      logMatrix('GET', '/api/devices', 'success', okA.status, 'ok');

      const okB = await apiFetch(baseUrl, '/api/devices', { token: tokenB });
      assert.equal(okB.status, 200);
      assert.equal(okB.json?.devices?.length, 1);
      assert.notEqual(okB.json.devices[0].id, okA.json.devices[0].id);
      logMatrix('GET', '/api/devices', 'idor_isolation', okB.status, 'ok');

      const wrongMethod = await apiFetch(baseUrl, '/api/devices', { method: 'POST', token: tokenA });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET');
      logMatrix('POST', '/api/devices', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 9. POST /api/devices/link
    let deviceA2 = '';
    let tokenA2 = '';
    {
      const noAuth = await apiFetch(baseUrl, '/api/devices/link', { method: 'POST', body: { deviceName: 'X' } });
      assert.equal(noAuth.status, 401);

      const linkA2 = await apiFetch(baseUrl, '/api/devices/link', {
        method: 'POST',
        token: tokenA,
        body: { deviceName: 'Device A2' },
      });
      assert.equal(linkA2.status, 201);
      assert.equal(linkA2.json?.userId, userIdA);
      deviceA2 = linkA2.json.deviceId;
      tokenA2 = linkA2.json.syncToken;
      logMatrix('POST', '/api/devices/link', 'success', linkA2.status, 'ok');

      const badJson = await apiFetch(baseUrl, '/api/devices/link', { method: 'POST', token: tokenA, body: '{bad' });
      assert.equal(badJson.status, 400);

      const wrongMethod = await apiFetch(baseUrl, '/api/devices/link', { method: 'GET', token: tokenA });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'POST');
      logMatrix('GET', '/api/devices/link', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 10. POST /api/devices/rotate
    let tokenA2Rotated = '';
    {
      const noAuth = await apiFetch(baseUrl, '/api/devices/rotate', { method: 'POST' });
      assert.equal(noAuth.status, 401);

      const rot = await apiFetch(baseUrl, '/api/devices/rotate', { method: 'POST', token: tokenA2 });
      assert.equal(rot.status, 200);
      assert.equal(rot.json?.deviceId, deviceA2);
      tokenA2Rotated = rot.json.syncToken;
      assert.notEqual(tokenA2Rotated, tokenA2);
      logMatrix('POST', '/api/devices/rotate', 'success', rot.status, 'ok');

      const oldTry = await apiFetch(baseUrl, '/api/devices', { token: tokenA2 });
      assert.equal(oldTry.status, 401);

      const wrongMethod = await apiFetch(baseUrl, '/api/devices/rotate', { method: 'DELETE', token: tokenA });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'POST');
      logMatrix('DELETE', '/api/devices/rotate', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    resetRateLimits();

    // 11. DELETE /api/devices/:id
    {
      const noAuth = await apiFetch(baseUrl, `/api/devices/${deviceA2}`, { method: 'DELETE' });
      assert.equal(noAuth.status, 401);

      const idor = await apiFetch(baseUrl, `/api/devices/${deviceA2}`, { method: 'DELETE', token: tokenB });
      assert.equal(idor.status, 404);
      logMatrix('DELETE', '/api/devices/:id', 'idor_blocked', idor.status, idor.json?.error?.code);

      const tooLongId = await apiFetch(baseUrl, `/api/devices/${'d'.repeat(65)}`, { method: 'DELETE', token: tokenA });
      assert.equal(tooLongId.status, 400);

      const okDel = await apiFetch(baseUrl, `/api/devices/${deviceA2}`, { method: 'DELETE', token: tokenA });
      assert.equal(okDel.status, 200);
      assert.equal(okDel.json?.revoked, true);
      logMatrix('DELETE', '/api/devices/:id', 'success', okDel.status, 'ok');

      const revokedTry = await apiFetch(baseUrl, '/api/devices', { token: tokenA2Rotated });
      assert.equal(revokedTry.status, 401);

      const wrongMethod = await apiFetch(baseUrl, `/api/devices/${deviceA2}`, { method: 'GET', token: tokenA });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'DELETE');
      logMatrix('GET', '/api/devices/:id', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);
    }

    // 12. GET /api/profile & 13. PUT /api/profile
    {
      const noAuthGet = await apiFetch(baseUrl, '/api/profile');
      assert.equal(noAuthGet.status, 401);

      const getA = await apiFetch(baseUrl, '/api/profile', { token: tokenA });
      assert.equal(getA.status, 404); // New registration has no invented group.
      logMatrix('GET', '/api/profile', 'unconfigured', getA.status, getA.json?.error?.code);

      const wrongMethod = await apiFetch(baseUrl, '/api/profile', { method: 'POST', token: tokenA });
      assert.equal(wrongMethod.status, 405);
      assert.equal(wrongMethod.headers.get('Allow'), 'GET, PUT');
      logMatrix('POST', '/api/profile', 'wrong_method', wrongMethod.status, wrongMethod.json?.error?.code);

      const noAuthPut = await apiFetch(baseUrl, '/api/profile', { method: 'PUT', body: {} });
      assert.equal(noAuthPut.status, 401);

      const putA = await apiFetch(baseUrl, '/api/profile', {
        method: 'PUT',
        token: tokenA,
        body: {
          sourceMode: 'live',
          expectedRevision: 0,
          universityId: 'lnu',
          facultyId: '1005',
          facultyName: "Факультет електроніки та комп'ютерних технологій",
          course: 3,
          groupId: 'ФЕП-33с',
          groupName: 'ФЕП-33с',
          subgroup: 2,
          electiveCourse: 'space',
          timezone: 'Europe/Kyiv',
        },
      });
      assert.equal(putA.status, 200);
      assert.equal(putA.json?.profile?.subgroup, 2);
      const confirmedA = await apiFetch(baseUrl, '/api/profile', { token: tokenA });
      assert.equal(confirmedA.status, 200);
      assert.equal(confirmedA.json?.profile?.userId, userIdA);
      logMatrix('PUT', '/api/profile', 'success', putA.status, 'ok');

      const badPut = await apiFetch(baseUrl, '/api/profile', {
        method: 'PUT',
        token: tokenA,
        body: { universityId: 'lnu', groupId: 'ФЕП-33с', groupName: 'ФЕП-33с', subgroup: 3 },
      });
      assert.equal(badPut.status, 400);
      logMatrix('PUT', '/api/profile', 'invalid_subgroup', badPut.status, badPut.json?.error?.code);

      // IDOR attempt: User B sends userId: userIdA in body; must only update User B
      const idorPut = await apiFetch(baseUrl, '/api/profile', {
        method: 'PUT',
        token: tokenB,
        body: {
          userId: userIdA,
          sourceMode: 'live',
          expectedRevision: 0,
          universityId: 'lnu',
          groupId: 'ПМІ-41',
          groupName: 'ПМІ-41',
          subgroup: 1,
        },
      });
      assert.equal(idorPut.status, 200);
      assert.equal(idorPut.json?.profile?.userId, userIdB);
      const verifyA = await apiFetch(baseUrl, '/api/profile', { token: tokenA });
      assert.equal(verifyA.json?.profile?.groupName, 'ФЕП-33с');
      logMatrix('PUT', '/api/profile', 'idor_isolated', idorPut.status, 'ok');

      const builtinA = await apiFetch(baseUrl, '/api/profile', {
        method: 'PUT', token: tokenA,
        body: { sourceMode: 'builtin', expectedRevision: 1 },
      });
      assert.equal(builtinA.status, 200);
      assert.equal(builtinA.json?.profile?.sourceMode, 'builtin');
      assert.equal(builtinA.json?.profile?.revision, 2);
      const staleA = await apiFetch(baseUrl, '/api/profile', {
        method: 'PUT', token: tokenA,
        body: { sourceMode: 'live', expectedRevision: 1,
          universityId: 'lnu', groupId: 'ФЕП-33с', groupName: 'ФЕП-33с' },
      });
      assert.equal(staleA.status, 409);
      assert.equal(staleA.json?.revision, 2);
      const verifyBuiltinA = await apiFetch(baseUrl, '/api/profile', { token: tokenA });
      assert.equal(verifyBuiltinA.json?.profile?.sourceMode, 'builtin');
      logMatrix('PUT', '/api/profile', 'builtin_transition_and_stale_rejection', builtinA.status, 'ok');

      const delMethod = await apiFetch(baseUrl, '/api/profile', { method: 'DELETE', token: tokenA });
      assert.equal(delMethod.status, 405);
      assert.equal(delMethod.headers.get('Allow'), 'GET, PUT');
    }

    resetRateLimits();

    // 14. GET /api/push/subscriptions & 15. POST /api/push/subscriptions & 16. DELETE /api/push/subscriptions/:id
    let subIdA = '';
    {
      const noAuthPost = await apiFetch(baseUrl, '/api/push/subscriptions', { method: 'POST', body: {} });
      assert.equal(noAuthPost.status, 401);

      const dummyKeys = {
        p256dh: Buffer.from(crypto.randomBytes(65)).toString('base64url'),
        auth: Buffer.from(crypto.randomBytes(16)).toString('base64url'),
      };

      const postA = await apiFetch(baseUrl, '/api/push/subscriptions', {
        method: 'POST',
        token: tokenA,
        body: { endpoint: 'https://push.local.test/sub-a', keys: dummyKeys },
      });
      assert.equal(postA.status, 201);
      logMatrix('POST', '/api/push/subscriptions', 'success', postA.status, 'ok');

      const badPost = await apiFetch(baseUrl, '/api/push/subscriptions', {
        method: 'POST',
        token: tokenA,
        body: { endpoint: 'http://insecure.test/sub', keys: dummyKeys },
      });
      assert.equal(badPost.status, 400);
      logMatrix('POST', '/api/push/subscriptions', 'invalid_scheme', badPost.status, badPost.json?.error?.code);

      const listNoAuth = await apiFetch(baseUrl, '/api/push/subscriptions');
      assert.equal(listNoAuth.status, 401);

      const listA = await apiFetch(baseUrl, '/api/push/subscriptions', { token: tokenA });
      assert.equal(listA.status, 200);
      assert.equal(listA.json?.subscriptions?.length, 1);
      subIdA = listA.json.subscriptions[0].id;
      logMatrix('GET', '/api/push/subscriptions', 'success', listA.status, 'ok');

      const listB = await apiFetch(baseUrl, '/api/push/subscriptions', { token: tokenB });
      assert.equal(listB.status, 200);
      assert.equal(listB.json?.subscriptions?.length, 0);
      logMatrix('GET', '/api/push/subscriptions', 'idor_isolated', listB.status, 'ok');

      const wrongListMethod = await apiFetch(baseUrl, '/api/push/subscriptions', { method: 'DELETE', token: tokenA });
      assert.equal(wrongListMethod.status, 405);
      assert.equal(wrongListMethod.headers.get('Allow'), 'GET, POST');

      // DELETE /api/push/subscriptions/:id
      const delNoAuth = await apiFetch(baseUrl, `/api/push/subscriptions/${subIdA}`, { method: 'DELETE' });
      assert.equal(delNoAuth.status, 401);

      const delIdor = await apiFetch(baseUrl, `/api/push/subscriptions/${subIdA}`, { method: 'DELETE', token: tokenB });
      assert.equal(delIdor.status, 404);
      logMatrix('DELETE', '/api/push/subscriptions/:id', 'idor_blocked', delIdor.status, delIdor.json?.error?.code);

      const delBadId = await apiFetch(baseUrl, `/api/push/subscriptions/${'s'.repeat(65)}`, { method: 'DELETE', token: tokenA });
      assert.equal(delBadId.status, 400);

      const delA = await apiFetch(baseUrl, `/api/push/subscriptions/${subIdA}`, { method: 'DELETE', token: tokenA });
      assert.equal(delA.status, 200);
      assert.equal(delA.json?.deleted, true);
      logMatrix('DELETE', '/api/push/subscriptions/:id', 'success', delA.status, 'ok');

      const wrongDelMethod = await apiFetch(baseUrl, `/api/push/subscriptions/${subIdA}`, { method: 'GET', token: tokenA });
      assert.equal(wrongDelMethod.status, 405);
      assert.equal(wrongDelMethod.headers.get('Allow'), 'DELETE');
    }

    resetRateLimits();

    // 17. GET /api/notifications/preferences & 18. PUT /api/notifications/preferences
    {
      const noAuthGet = await apiFetch(baseUrl, '/api/notifications/preferences');
      assert.equal(noAuthGet.status, 401);

      const getA = await apiFetch(baseUrl, '/api/notifications/preferences', { token: tokenA });
      assert.equal(getA.status, 200);
      assert.equal(getA.json?.preferences?.enabled, true);
      logMatrix('GET', '/api/notifications/preferences', 'success', getA.status, 'ok');

      const wrongGetMethod = await apiFetch(baseUrl, '/api/notifications/preferences', { method: 'POST', token: tokenA });
      assert.equal(wrongGetMethod.status, 405);
      assert.equal(wrongGetMethod.headers.get('Allow'), 'GET, PUT');

      const noAuthPut = await apiFetch(baseUrl, '/api/notifications/preferences', { method: 'PUT', body: {} });
      assert.equal(noAuthPut.status, 401);

      const putA = await apiFetch(baseUrl, '/api/notifications/preferences', {
        method: 'PUT',
        token: tokenA,
        body: { morningTime: '07:45', beforeLessonMinutes: 15 },
      });
      assert.equal(putA.status, 200);
      assert.equal(putA.json?.preferences?.enabled, true); // preserved!
      assert.equal(putA.json?.preferences?.morningTime, '07:45');
      assert.equal(putA.json?.preferences?.beforeLessonMinutes, 15);
      logMatrix('PUT', '/api/notifications/preferences', 'success_partial', putA.status, 'ok');

      const badPut = await apiFetch(baseUrl, '/api/notifications/preferences', {
        method: 'PUT',
        token: tokenA,
        body: { morningTime: '25:99' },
      });
      assert.equal(badPut.status, 400);
      logMatrix('PUT', '/api/notifications/preferences', 'invalid_time', badPut.status, badPut.json?.error?.code);

      const getB = await apiFetch(baseUrl, '/api/notifications/preferences', { token: tokenB });
      assert.equal(getB.status, 200);
      assert.equal(getB.json?.preferences?.morningTime, '08:00'); // unaffected by A

      const wrongPutMethod = await apiFetch(baseUrl, '/api/notifications/preferences', { method: 'DELETE', token: tokenA });
      assert.equal(wrongPutMethod.status, 405);
      assert.equal(wrongPutMethod.headers.get('Allow'), 'GET, PUT');
    }

    resetRateLimits();

    // 19. GET /api/attendance & 20. POST /api/attendance/sync
    {
      const noAuthSync = await apiFetch(baseUrl, '/api/attendance/sync', { method: 'POST', body: { mutations: [] } });
      assert.equal(noAuthSync.status, 401);

      const syncA = await apiFetch(baseUrl, '/api/attendance/sync', {
        method: 'POST',
        token: tokenA,
        body: {
          mutations: [
            {
              lessonId: 'seed-lesson-1',
              lessonDate: '2026-11-18',
              status: 'attended',
              updatedAt: '2026-11-18T09:00:00Z',
            },
          ],
        },
      });
      assert.equal(syncA.status, 200);
      assert.equal(syncA.json?.applied, 1);
      assert.equal(syncA.json?.records?.length, 1);
      assert.equal(syncA.json?.records?.[0]?.serverVersion, 1);
      logMatrix('POST', '/api/attendance/sync', 'success', syncA.status, 'ok');

      const badSync = await apiFetch(baseUrl, '/api/attendance/sync', {
        method: 'POST',
        token: tokenA,
        body: { mutations: [{ lessonId: 'l1', lessonDate: 'bad-date', status: 'attended', updatedAt: '2026-11-18T09:00:00Z' }] },
      });
      assert.equal(badSync.status, 400);
      logMatrix('POST', '/api/attendance/sync', 'invalid_date', badSync.status, badSync.json?.error?.code);

      const wrongSyncMethod = await apiFetch(baseUrl, '/api/attendance/sync', { method: 'GET', token: tokenA });
      assert.equal(wrongSyncMethod.status, 405);
      assert.equal(wrongSyncMethod.headers.get('Allow'), 'POST');

      const noAuthGet = await apiFetch(baseUrl, '/api/attendance');
      assert.equal(noAuthGet.status, 401);

      const getA = await apiFetch(baseUrl, '/api/attendance', { token: tokenA });
      assert.equal(getA.status, 200);
      assert.equal(getA.json?.records?.length, 1);
      logMatrix('GET', '/api/attendance', 'success', getA.status, 'ok');

      const badGet = await apiFetch(baseUrl, '/api/attendance?since=not-a-date', { token: tokenA });
      assert.equal(badGet.status, 400);

      const getB = await apiFetch(baseUrl, '/api/attendance', { token: tokenB });
      assert.equal(getB.status, 200);
      assert.equal(getB.json?.records?.length, 0);
      logMatrix('GET', '/api/attendance', 'idor_isolated', getB.status, 'ok');

      const wrongGetMethod = await apiFetch(baseUrl, '/api/attendance', { method: 'POST', token: tokenA });
      assert.equal(wrongGetMethod.status, 405);
      assert.equal(wrongGetMethod.headers.get('Allow'), 'GET');
    }

    // Unknown route -> 404
    {
      const unknown = await apiFetch(baseUrl, '/api/nonexistent-endpoint');
      assert.equal(unknown.status, 404);
      logMatrix('GET', '/api/nonexistent-endpoint', 'not_found', unknown.status, unknown.json?.error?.code);
    }

    // Explicit 429 rate-limit check (> 20 write requests in one bucket)
    resetRateLimits();
    {
      let hit429 = false;
      let retryAfter = '';
      for (let i = 0; i < 22; i += 1) {
        const res = await apiFetch(baseUrl, '/api/auth/register', {
          method: 'POST',
          headers: { 'CF-Connecting-IP': '198.51.100.77' },
          body: { deviceName: `RateTest-${i}` },
        });
        if (res.status === 429) {
          hit429 = true;
          retryAfter = res.headers.get('Retry-After') ?? '';
          assert.equal(res.json?.error?.code, 'RATE_LIMITED');
          break;
        }
      }
      assert.equal(hit429, true, 'Expected 429 RATE_LIMITED after > 20 write requests');
      assert.ok(Number(retryAfter) >= 1, 'Expected Retry-After header >= 1');
      logMatrix('POST', '/api/auth/register', 'rate_limit_429', 429, `Retry-After=${retryAfter}`);
    }
  });
});
