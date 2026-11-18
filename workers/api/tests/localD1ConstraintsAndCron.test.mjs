import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getPlatformProxy } from 'wrangler';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKER_DIR = path.resolve(__dirname, '..');
const ROOT_DIR = path.resolve(WORKER_DIR, '..', '..');
const WRANGLER_BIN = path.join(WORKER_DIR, 'node_modules', '.bin', 'wrangler');
const ESBUILD_BIN = path.join(ROOT_DIR, 'node_modules', '.bin', 'esbuild');

function runWrangler(args) {
  return execFileSync(WRANGLER_BIN, args, {
    cwd: WORKER_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function bytesToBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function generateTestVapidKeys() {
  const kp = await crypto.webcrypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const jwk = await crypto.webcrypto.subtle.exportKey('jwk', kp.privateKey);
  const pubRaw = new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', kp.publicKey));
  const privBytes = Buffer.from(jwk.d.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return {
    publicKey: bytesToBase64Url(pubRaw),
    privateKey: bytesToBase64Url(privBytes),
    subject: 'mailto:stage71-test@uni-schedule.app',
  };
}

async function generateSubscriberKeys() {
  const kp = await crypto.webcrypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );
  const pubRaw = new Uint8Array(await crypto.webcrypto.subtle.exportKey('raw', kp.publicKey));
  const auth = crypto.randomBytes(16);
  return {
    p256dh: bytesToBase64Url(pubRaw),
    auth: bytesToBase64Url(auth),
  };
}

describe('Stage 7.1 Real Local Wrangler D1: Constraints & 5 Cron Scenarios', () => {
  let persistDir = '';
  let schedulerBundlePath = '';
  let proxy = null;
  let db = null;
  let schedulerMod = null;
  let pushServer = null;
  let pushBaseUrl = '';
  const receivedPushes = [];

  before(async () => {
    persistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-stage71-d1-'));
    schedulerBundlePath = path.join(persistDir, 'scheduler.bundle.mjs');

    runWrangler([
      'd1',
      'migrations',
      'apply',
      'uni-schedule-db',
      '--local',
      '--persist-to',
      persistDir,
    ]);

    execFileSync(
      ESBUILD_BIN,
      [
        path.join(WORKER_DIR, 'src/push/scheduler.ts'),
        '--bundle',
        '--platform=node',
        '--format=esm',
        `--outfile=${schedulerBundlePath}`,
      ],
      { cwd: ROOT_DIR, stdio: ['ignore', 'pipe', 'pipe'] }
    );
    schedulerMod = await import(pathToFileURL(schedulerBundlePath).href);

    proxy = await getPlatformProxy({
      configPath: path.join(WORKER_DIR, 'wrangler.toml'),
      persist: { path: path.join(persistDir, 'v3') },
    });
    db = proxy.env.DB;

    pushServer = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => {
        const body = Buffer.concat(chunks);
        receivedPushes.push({
          method: req.method,
          url: req.url,
          authorization: req.headers.authorization || '',
          contentEncoding: req.headers['content-encoding'] || '',
          bodyBytes: body.length,
        });
        res.statusCode = 201;
        res.end('Created');
      });
    });

    await new Promise((resolve, reject) => {
      pushServer.on('error', reject);
      pushServer.listen(0, '127.0.0.1', () => {
        const addr = pushServer.address();
        pushBaseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (pushServer) {
      await new Promise((resolve) => pushServer.close(() => resolve()));
    }
    if (proxy) {
      await proxy.dispose();
    }
    if (persistDir && fs.existsSync(persistDir)) {
      fs.rmSync(persistDir, { recursive: true, force: true });
    }
  });

  it('enforces FOREIGN KEY, UNIQUE, CHECK, NOT NULL constraints and atomic rollback on real Wrangler D1', async () => {
    const now = '2026-11-19T00:00:00.000Z';

    // Seed valid baseline records
    await db
      .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
      .bind('u-fk-1', now, now)
      .run();
    await db
      .prepare(
        'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .bind('d-fk-1', 'u-fk-1', 'Phone', 'hash-unique-1', now, now)
      .run();
    await db
      .prepare(
        'INSERT INTO attendance_records (user_id, lesson_id, lesson_date, status, updated_at, device_id, server_version, server_updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
      )
      .bind('u-fk-1', 'l-fk-1', '2026-11-19', 'attended', now, 'd-fk-1', now)
      .run();

    // 1. FOREIGN KEY violations
    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind('d-bad', 'nonexistent-user', 'Bad', 'hash-bad', now, now)
          .run(),
      /FOREIGN KEY constraint failed/i
    );

    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          )
          .bind('s-bad', 'u-fk-1', 'nonexistent-device', 'https://push.test/bad', 'p', 'a', now)
          .run(),
      /FOREIGN KEY constraint failed/i
    );

    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO attendance_records (user_id, lesson_id, lesson_date, status, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .bind('nonexistent-user', 'l-1', '2026-11-19', 'attended', now)
          .run(),
      /FOREIGN KEY constraint failed/i
    );

    // 2. UNIQUE violations
    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind('d-fk-2', 'u-fk-1', 'DupHash', 'hash-unique-1', now, now)
          .run(),
      /UNIQUE constraint failed/i
    );

    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO attendance_records (user_id, lesson_id, lesson_date, status, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .bind('u-fk-1', 'l-fk-1', '2026-11-19', 'absent', now)
          .run(),
      /UNIQUE constraint failed/i
    );

    // 3. CHECK & NOT NULL violations
    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO attendance_records (user_id, lesson_id, lesson_date, status, updated_at) VALUES (?, ?, ?, ?, ?)'
          )
          .bind('u-fk-1', 'l-fk-2', '2026-11-19', 'invalid_status', now)
          .run(),
      /CHECK constraint failed/i
    );

    await assert.rejects(
      () =>
        db
          .prepare(
            'INSERT INTO notification_preferences (user_id, enabled, before_lesson_minutes, updated_at) VALUES (?, 1, 99, ?)'
          )
          .bind('u-fk-1', now)
          .run(),
      /CHECK constraint failed/i
    );

    await assert.rejects(
      () =>
        db
          .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
          .bind('u-null', null, now)
          .run(),
      /NOT NULL constraint failed/i
    );

    // 4. Atomic batch rollback & data integrity check
    await assert.rejects(() =>
      db.batch([
        db
          .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
          .bind('u-batch-rollback', now, now),
        db
          .prepare(
            'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
          )
          .bind('d-batch-bad', 'missing-user', 'Bad', 'hash-bad-2', now, now),
      ])
    );

    const rolledBackUser = await db
      .prepare('SELECT id FROM users WHERE id = ?')
      .bind('u-batch-rollback')
      .first();
    assert.equal(rolledBackUser, null, 'Failed batch must roll back first statement');

    // Baseline data remains uncorrupted
    const baselineAtt = await db
      .prepare('SELECT status FROM attendance_records WHERE user_id = ? AND lesson_id = ?')
      .bind('u-fk-1', 'l-fk-1')
      .first();
    assert.equal(baselineAtt?.status, 'attended');

    // ON DELETE CASCADE cleans up child rows
    await db.prepare('DELETE FROM users WHERE id = ?').bind('u-fk-1').run();
    const cascadeDev = await db
      .prepare('SELECT id FROM user_devices WHERE id = ?')
      .bind('d-fk-1')
      .first();
    const cascadeAtt = await db
      .prepare('SELECT lesson_id FROM attendance_records WHERE user_id = ?')
      .bind('u-fk-1')
      .first();
    assert.equal(cascadeDev, null);
    assert.equal(cascadeAtt, null);
  });

  it('executes all 5 Cron scenarios, deduplication, disabled-user filtering, and DST/timezone transitions on real Wrangler D1', async () => {
    const now = '2026-11-19T00:00:00.000Z';
    const vapid = await generateTestVapidKeys();
    const subKeysActive = await generateSubscriberKeys();
    const subKeysDisabled = await generateSubscriberKeys();
    const subKeysKyivSummer = await generateSubscriberKeys();
    const subKeysNy = await generateSubscriberKeys();

    const env = {
      DB: db,
      VAPID_PUBLIC_KEY: vapid.publicKey,
      VAPID_PRIVATE_KEY: vapid.privateKey,
      VAPID_SUBJECT: vapid.subject,
    };

    // Seed active user (Europe/Kyiv), disabled user, group & schedule for 2026-11-20 (Friday)
    await db.batch([
      db
        .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
        .bind('u-cron-active', now, now),
      db
        .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
        .bind('u-cron-disabled', now, now),
      db
        .prepare(
          'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind('d-cron-active', 'u-cron-active', 'Pixel', 'cron-hash-1', now, now),
      db
        .prepare(
          'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind('d-cron-disabled', 'u-cron-disabled', 'iPhone', 'cron-hash-2', now, now),
      db
        .prepare(
          'INSERT INTO student_profiles (user_id, university_id, group_id, group_name, subgroup, timezone, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        )
        .bind('u-cron-active', 'lnu', 'ФЕП-33с', 'ФЕП-33с', 'Europe/Kyiv', now),
      db
        .prepare(
          'INSERT INTO student_profiles (user_id, university_id, group_id, group_name, subgroup, timezone, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        )
        .bind('u-cron-disabled', 'lnu', 'ФЕП-33с', 'ФЕП-33с', 'Europe/Kyiv', now),
      db
        .prepare(
          'INSERT INTO push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          'sub-active',
          'u-cron-active',
          'd-cron-active',
          `${pushBaseUrl}/push/active`,
          subKeysActive.p256dh,
          subKeysActive.auth,
          now
        ),
      db
        .prepare(
          'INSERT INTO push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind(
          'sub-disabled',
          'u-cron-disabled',
          'd-cron-disabled',
          `${pushBaseUrl}/push/disabled`,
          subKeysDisabled.p256dh,
          subKeysDisabled.auth,
          now
        ),
      db
        .prepare(
          `INSERT INTO notification_preferences
            (user_id, enabled, morning_enabled, morning_time, before_lesson_enabled, before_lesson_minutes,
             before_end_enabled, before_end_minutes, evening_enabled, evening_time, friday_enabled, friday_time, updated_at)
           VALUES (?, 1, 1, '08:00', 1, 10, 1, 10, 1, '20:00', 1, '18:00', ?)`
        )
        .bind('u-cron-active', now),
      db
        .prepare(
          `INSERT INTO notification_preferences
            (user_id, enabled, morning_enabled, morning_time, before_lesson_enabled, before_lesson_minutes,
             before_end_enabled, before_end_minutes, evening_enabled, evening_time, friday_enabled, friday_time, updated_at)
           VALUES (?, 0, 1, '08:00', 1, 10, 1, 10, 1, '20:00', 1, '18:00', ?)`
        )
        .bind('u-cron-disabled', now),
      db
        .prepare(
          'INSERT INTO university_groups (id, university_id, group_code, group_name, created_at) VALUES (?, ?, ?, ?, ?)'
        )
        .bind('lnu:ФЕП-33с', 'lnu', 'ФЕП-33с', 'ФЕП-33с', now),
      db
        .prepare(
          `INSERT INTO schedule_entries
            (id, group_id, lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time, subject, lesson_type, teacher, room, subgroup, updated_at)
           VALUES (?, 'lnu:ФЕП-33с', ?, '2026-11-20', 5, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind('se-1', 'l-fri-1', 1, '08:30', '09:50', 'Програмування', 'Лекція', 'Іванов І.І.', '214', now),
      db
        .prepare(
          `INSERT INTO schedule_entries
            (id, group_id, lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time, subject, lesson_type, teacher, room, subgroup, updated_at)
           VALUES (?, 'lnu:ФЕП-33с', ?, '2026-11-20', 5, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind('se-2', 'l-fri-2', 2, '10:10', '11:30', 'Бази даних', 'Практична', 'Петров П.П.', '301', now),
      db
        .prepare(
          `INSERT INTO schedule_entries
            (id, group_id, lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time, subject, lesson_type, teacher, room, subgroup, updated_at)
           VALUES (?, 'lnu:ФЕП-33с', ?, '2026-11-20', 5, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
        )
        .bind('se-3', 'l-fri-3', 3, '11:50', '13:10', 'Алгоритми', 'Лабораторна', 'Сидоров С.С.', '105', now),
      db
        .prepare(
          'INSERT INTO attendance_records (user_id, lesson_id, lesson_date, status, updated_at, device_id, server_version, server_updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
        )
        .bind('u-cron-active', 'l-fri-1', '2026-11-20', 'attended', now, 'd-cron-active', now),
      db
        .prepare(
          'INSERT INTO attendance_records (user_id, lesson_id, lesson_date, status, updated_at, device_id, server_version, server_updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)'
        )
        .bind('u-cron-active', 'l-fri-2', '2026-11-20', 'excused', now, 'd-cron-active', now),
    ]);

    const scenarios = [
      { name: 'morning', utc: '2026-11-20T06:00:00Z', dupUtc: '2026-11-20T06:02:00Z' },
      { name: 'before_lesson', utc: '2026-11-20T06:20:00Z', dupUtc: '2026-11-20T06:22:00Z' },
      { name: 'before_end', utc: '2026-11-20T07:40:00Z', dupUtc: '2026-11-20T07:42:00Z' },
      { name: 'friday', utc: '2026-11-20T16:00:00Z', dupUtc: '2026-11-20T16:02:00Z' },
      { name: 'evening', utc: '2026-11-20T18:00:00Z', dupUtc: '2026-11-20T18:02:00Z' },
    ];

    for (const sc of scenarios) {
      const beforeCount = receivedPushes.length;
      const res1 = await schedulerMod.runNotificationCron(env, new Date(sc.utc));
      assert.equal(res1.sent, 1, `Scenario ${sc.name} should send 1 notification`);
      assert.equal(receivedPushes.length, beforeCount + 1);
      const lastPush = receivedPushes[receivedPushes.length - 1];
      assert.equal(lastPush.url, '/push/active');
      assert.equal(lastPush.contentEncoding, 'aes128gcm');
      assert.ok(lastPush.authorization.startsWith('vapid t='));
      assert.ok(lastPush.bodyBytes > 86);

      const logRow = await db
        .prepare('SELECT type, status, dedup_key FROM notification_logs WHERE user_id = ? AND type = ?')
        .bind('u-cron-active', sc.name)
        .first();
      assert.equal(logRow?.type, sc.name);
      assert.equal(logRow?.status, 'sent');

      // Repeat within 5-min window -> deduplicated
      const resDup = await schedulerMod.runNotificationCron(env, new Date(sc.dupUtc));
      assert.equal(resDup.sent, 0, `Scenario ${sc.name} repeat must be deduplicated`);
      assert.equal(resDup.deduplicated, 1);
      assert.equal(receivedPushes.length, beforeCount + 1);

      console.log(`[CRON_SCENARIO_OK] ${sc.name} | sent=1, dup=0, dedup_key=${logRow?.dedup_key}`);
    }

    // Disabled user must have 0 logs and 0 push requests
    const disabledLogs = await db
      .prepare('SELECT COUNT(*) AS cnt FROM notification_logs WHERE user_id = ?')
      .bind('u-cron-disabled')
      .first();
    assert.equal(disabledLogs?.cnt, 0);
    assert.equal(receivedPushes.filter((p) => p.url === '/push/disabled').length, 0);

    // Timezone & DST verification on real D1:
    // 1) Europe/Kyiv summer (UTC+3): 05:00 UTC == 08:00 Kyiv
    // 2) America/New_York winter (UTC-5): 13:00 UTC == 08:00 NY, summer (UTC-4): 12:00 UTC == 08:00 NY
    await db.batch([
      db
        .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
        .bind('u-kyiv-dst', now, now),
      db
        .prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)')
        .bind('u-ny-tz', now, now),
      db
        .prepare(
          'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind('d-kyiv-dst', 'u-kyiv-dst', 'Web', 'hash-kyiv-dst', now, now),
      db
        .prepare(
          'INSERT INTO user_devices (id, user_id, device_name, token_hash, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)'
        )
        .bind('d-ny-tz', 'u-ny-tz', 'Web', 'hash-ny-tz', now, now),
      db
        .prepare(
          'INSERT INTO student_profiles (user_id, university_id, group_id, group_name, subgroup, timezone, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        )
        .bind('u-kyiv-dst', 'lnu', 'ФЕП-33с', 'ФЕП-33с', 'Europe/Kyiv', now),
      db
        .prepare(
          'INSERT INTO student_profiles (user_id, university_id, group_id, group_name, subgroup, timezone, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
        )
        .bind('u-ny-tz', 'lnu', 'ФЕП-33с', 'ФЕП-33с', 'America/New_York', now),
      db
        .prepare(
          'INSERT INTO push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind('sub-kyiv-dst', 'u-kyiv-dst', 'd-kyiv-dst', `${pushBaseUrl}/push/kyiv-dst`, subKeysKyivSummer.p256dh, subKeysKyivSummer.auth, now),
      db
        .prepare(
          'INSERT INTO push_subscriptions (id, user_id, device_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .bind('sub-ny-tz', 'u-ny-tz', 'd-ny-tz', `${pushBaseUrl}/push/ny-tz`, subKeysNy.p256dh, subKeysNy.auth, now),
      db
        .prepare(
          `INSERT INTO notification_preferences
            (user_id, enabled, morning_enabled, morning_time, before_lesson_enabled, before_lesson_minutes,
             before_end_enabled, before_end_minutes, evening_enabled, evening_time, friday_enabled, friday_time, updated_at)
           VALUES (?, 1, 1, '08:00', 0, 10, 0, 10, 0, '20:00', 0, '18:00', ?)`
        )
        .bind('u-kyiv-dst', now),
      db
        .prepare(
          `INSERT INTO notification_preferences
            (user_id, enabled, morning_enabled, morning_time, before_lesson_enabled, before_lesson_minutes,
             before_end_enabled, before_end_minutes, evening_enabled, evening_time, friday_enabled, friday_time, updated_at)
           VALUES (?, 1, 1, '08:00', 0, 10, 0, 10, 0, '20:00', 0, '18:00', ?)`
        )
        .bind('u-ny-tz', now),
    ]);

    const kyivSummerRes = await schedulerMod.runNotificationCron(env, new Date('2026-07-17T05:00:00Z'));
    assert.equal(kyivSummerRes.sent, 2); // Both u-cron-active and u-kyiv-dst are in Europe/Kyiv at 08:00 UTC+3
    assert.ok(receivedPushes.slice(-2).some((p) => p.url === '/push/kyiv-dst'));

    const nyWinterRes = await schedulerMod.runNotificationCron(env, new Date('2026-01-16T13:00:00Z'));
    assert.equal(nyWinterRes.sent, 1);
    assert.equal(receivedPushes[receivedPushes.length - 1].url, '/push/ny-tz');

    const nySummerRes = await schedulerMod.runNotificationCron(env, new Date('2026-07-17T12:00:00Z'));
    assert.equal(nySummerRes.sent, 1);
    assert.equal(receivedPushes[receivedPushes.length - 1].url, '/push/ny-tz');

    console.log('[CRON_TZ_OK] Europe/Kyiv (UTC+2/UTC+3) & America/New_York (UTC-5/UTC-4) verified on real D1');
  });
});
