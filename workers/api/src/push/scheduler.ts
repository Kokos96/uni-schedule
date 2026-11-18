import { sendWebPushWithRetry, type PushPayload, type VapidConfig } from './webPush';
import type { Env } from '../types';

const WEEKDAY_MAP: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export interface LocalDateTimeParts {
  isoDate: string;
  weekday: number; // 1=Mon .. 7=Sun
  minutesOfDay: number;
}

/**
 * Converts a UTC Date into the user's local calendar date, ISO weekday, and minute-of-day
 * using `Intl.DateTimeFormat` so DST transitions in any IANA timezone are handled accurately.
 */
export function getLocalDateTimeParts(
  nowUtc: Date,
  timeZone: string
): LocalDateTimeParts {
  const safeTz = timeZone || 'Europe/Kyiv';
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(nowUtc);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

  const year = get('year');
  const month = get('month');
  const day = get('day');
  const weekdayStr = get('weekday');
  const hour = Number.parseInt(get('hour'), 10);
  const minute = Number.parseInt(get('minute'), 10);

  const safeHour = Number.isFinite(hour) ? hour % 24 : 0;
  const safeMin = Number.isFinite(minute) ? minute : 0;

  return {
    isoDate: `${year}-${month}-${day}`,
    weekday: WEEKDAY_MAP[weekdayStr] ?? 1,
    minutesOfDay: safeHour * 60 + safeMin,
  };
}

export function hhmmToMinutes(hhmm: string): number | null {
  const match = hhmm.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isTimeInCronWindow(
  currentMinutes: number,
  targetMinutes: number,
  windowMinutes: number = 5
): boolean {
  return currentMinutes >= targetMinutes && currentMinutes < targetMinutes + windowMinutes;
}

function addDaysToIso(isoDate: string, delta: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + delta));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export interface ActiveSubscriptionRow {
  sub_id: string;
  user_id: string;
  device_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  university_id: string;
  group_id: string;
  subgroup: number;
  timezone: string;
  morning_enabled: number;
  morning_time: string;
  before_lesson_enabled: number;
  before_lesson_minutes: number;
  before_end_enabled: number;
  before_end_minutes: number;
  evening_enabled: number;
  evening_time: string;
  friday_enabled: number;
  friday_time: string;
}

export interface ScheduledLessonRow {
  lesson_id: string;
  lesson_date: string | null;
  day_of_week: number;
  pair_number: number;
  start_time: string;
  end_time: string;
  subject: string;
  lesson_type: string;
  teacher: string | null;
  room: string | null;
  building: string | null;
  subgroup: number | null;
}

interface CandidateNotification {
  type: 'morning' | 'before_lesson' | 'before_end' | 'evening' | 'friday';
  dedupKey: string;
  payload: PushPayload;
}

export function evaluateNotificationsForUser(
  row: ActiveSubscriptionRow,
  local: LocalDateTimeParts,
  todayLessons: readonly ScheduledLessonRow[],
  weekLessonsCount: number
): CandidateNotification[] {
  const candidates: CandidateNotification[] = [];

  // Filter lessons by student's subgroup
  const myTodayLessons = todayLessons
    .filter((l) => l.subgroup === null || l.subgroup === row.subgroup)
    .sort((a, b) => a.pair_number - b.pair_number || a.start_time.localeCompare(b.start_time));

  // 1. Morning digest
  if (row.morning_enabled === 1) {
    const targetMin = hhmmToMinutes(row.morning_time);
    if (targetMin !== null && isTimeInCronWindow(local.minutesOfDay, targetMin)) {
      const first = myTodayLessons[0];
      const body = first
        ? `Сьогодні у тебе ${myTodayLessons.length} пар(и). Перша о ${first.start_time} — ${first.subject}${first.room ? `, ауд. ${first.room}` : ''}.`
        : 'Сьогодні занять немає. Можеш спокійно відпочити!';

      candidates.push({
        type: 'morning',
        dedupKey: `${row.sub_id}:morning:${local.isoDate}`,
        payload: {
          title: 'Доброго ранку! ☀️',
          body,
          tag: `morning-${local.isoDate}`,
          url: '/',
        },
      });
    }
  }

  // 2. Before lesson & 3. Before lesson end
  for (const lesson of myTodayLessons) {
    const startMin = hhmmToMinutes(lesson.start_time);
    const endMin = hhmmToMinutes(lesson.end_time);

    if (row.before_lesson_enabled === 1 && startMin !== null) {
      const remindAt = startMin - row.before_lesson_minutes;
      if (isTimeInCronWindow(local.minutesOfDay, remindAt)) {
        const metaParts = [
          lesson.lesson_type,
          lesson.room ? `ауд. ${lesson.room}` : null,
          lesson.teacher ? `викладач: ${lesson.teacher}` : null,
        ].filter(Boolean);

        candidates.push({
          type: 'before_lesson',
          dedupKey: `${row.sub_id}:before_lesson:${local.isoDate}:${lesson.lesson_id}@${lesson.start_time}`,
          payload: {
            title: `За ${row.before_lesson_minutes} хв: ${lesson.subject}`,
            body: `Початок о ${lesson.start_time}${metaParts.length ? ` · ${metaParts.join(' · ')}` : ''}`,
            tag: `before-${lesson.lesson_id}-${local.isoDate}`,
            url: '/',
          },
        });
      }
    }

    if (row.before_end_enabled === 1 && endMin !== null) {
      const remindEndAt = endMin - row.before_end_minutes;
      if (isTimeInCronWindow(local.minutesOfDay, remindEndAt)) {
        candidates.push({
          type: 'before_end',
          dedupKey: `${row.sub_id}:before_end:${local.isoDate}:${lesson.lesson_id}@${lesson.end_time}`,
          payload: {
            title: `До завершення пари ${row.before_end_minutes} хв`,
            body: `${lesson.subject} завершується о ${lesson.end_time}.`,
            tag: `end-${lesson.lesson_id}-${local.isoDate}`,
            url: '/',
          },
        });
      }
    }
  }

  // 4. Evening summary (honest scheduled count; full attendance stats come in Stage 5)
  if (row.evening_enabled === 1 && myTodayLessons.length > 0) {
    const targetMin = hhmmToMinutes(row.evening_time);
    if (targetMin !== null && isTimeInCronWindow(local.minutesOfDay, targetMin)) {
      candidates.push({
        type: 'evening',
        dedupKey: `${row.sub_id}:evening:${local.isoDate}`,
        payload: {
          title: 'Вечірній підсумок дня',
          body: `Навчальний день завершено! За розкладом сьогодні було ${myTodayLessons.length} пар(и). Не забудь відмітити відвідуваність у додатку.`,
          tag: `evening-${local.isoDate}`,
          url: '/',
        },
      });
    }
  }

  // 5. Friday summary (configurable time, only on Fridays with scheduled lessons)
  if (row.friday_enabled === 1 && local.weekday === 5 && weekLessonsCount > 0) {
    const targetMin = hhmmToMinutes(row.friday_time);
    if (targetMin !== null && isTimeInCronWindow(local.minutesOfDay, targetMin)) {
      candidates.push({
        type: 'friday',
        dedupKey: `${row.sub_id}:friday:${local.isoDate}`,
        payload: {
          title: 'Тиждень завершено! 🎉',
          body: `Цього тижня за розкладом було ${weekLessonsCount} пар(и). Попереду вихідні — гарного відпочинку!`,
          tag: `friday-${local.isoDate}`,
          url: '/',
        },
      });
    }
  }

  return candidates;
}

export interface CronRunStats {
  checkedSubscriptions: number;
  attempted: number;
  sent: number;
  deduplicated: number;
  expiredDeleted: number;
  failed: number;
}

const MAX_SUBSCRIPTIONS_PER_TICK = 25;

export async function runNotificationCron(
  env: Env,
  nowUtc: Date = new Date()
): Promise<CronRunStats> {
  const stats: CronRunStats = {
    checkedSubscriptions: 0,
    attempted: 0,
    sent: 0,
    deduplicated: 0,
    expiredDeleted: 0,
    failed: 0,
  };

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return stats;
  }

  const vapid: VapidConfig = {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@uni-schedule.app',
  };

  const subsResult = await env.DB.prepare(
    `SELECT ps.id AS sub_id, ps.user_id, ps.device_id, ps.endpoint, ps.p256dh, ps.auth,
            sp.university_id, sp.group_id, sp.subgroup, sp.timezone,
            np.morning_enabled, np.morning_time,
            np.before_lesson_enabled, np.before_lesson_minutes,
            np.before_end_enabled, np.before_end_minutes,
            np.evening_enabled, np.evening_time,
            np.friday_enabled, np.friday_time
     FROM push_subscriptions ps
     JOIN user_devices ud ON ud.id = ps.device_id AND ud.revoked_at IS NULL
     JOIN student_profiles sp ON sp.user_id = ps.user_id
     JOIN notification_preferences np ON np.user_id = ps.user_id AND np.enabled = 1
     ORDER BY ps.created_at ASC`
  ).all<ActiveSubscriptionRow>();

  const rows = subsResult.results ?? [];
  stats.checkedSubscriptions = rows.length;

  // Cache schedule lookups per (groupKey, localIsoDate) within this Cron tick
  const dayScheduleCache = new Map<string, ScheduledLessonRow[]>();
  const weekCountCache = new Map<string, number>();

  for (let i = 0; i < rows.length; i += MAX_SUBSCRIPTIONS_PER_TICK) {
    const batch = rows.slice(i, i + MAX_SUBSCRIPTIONS_PER_TICK);

    for (const row of batch) {
      const local = getLocalDateTimeParts(nowUtc, row.timezone);
      const groupKey = `${row.university_id}:${row.group_id}`;
      const dayCacheKey = `${groupKey}:${local.isoDate}`;

      let todayLessons = dayScheduleCache.get(dayCacheKey);
      if (!todayLessons) {
        const res = await env.DB.prepare(
          `SELECT lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time,
                  subject, lesson_type, teacher, room, building, subgroup
           FROM schedule_entries
           WHERE group_id = ? AND (lesson_date = ? OR (lesson_date IS NULL AND day_of_week = ?))`
        )
          .bind(groupKey, local.isoDate, local.weekday)
          .all<ScheduledLessonRow>();
        todayLessons = res.results ?? [];
        dayScheduleCache.set(dayCacheKey, todayLessons);
      }

      let weekLessonsCount = 0;
      if (local.weekday === 5 && row.friday_enabled === 1) {
        const weekKey = `${groupKey}:${local.isoDate}:${row.subgroup}`;
        const cachedCount = weekCountCache.get(weekKey);
        if (cachedCount !== undefined) {
          weekLessonsCount = cachedCount;
        } else {
          const mondayIso = addDaysToIso(local.isoDate, -4);
          const weekRes = await env.DB.prepare(
            `SELECT lesson_id, subgroup
             FROM schedule_entries
             WHERE group_id = ? AND lesson_date BETWEEN ? AND ?`
          )
            .bind(groupKey, mondayIso, local.isoDate)
            .all<{ lesson_id: string; subgroup: number | null }>();
          weekLessonsCount = (weekRes.results ?? []).filter(
            (l) => l.subgroup === null || l.subgroup === row.subgroup
          ).length;
          weekCountCache.set(weekKey, weekLessonsCount);
        }
      }

      const candidates = evaluateNotificationsForUser(
        row,
        local,
        todayLessons,
        weekLessonsCount
      );

      for (const candidate of candidates) {
        stats.attempted += 1;
        const logId = crypto.randomUUID();
        const nowIso = nowUtc.toISOString();

        // Atomic deduplication claim via UNIQUE(dedup_key)
        const claimRes = await env.DB.prepare(
          `INSERT OR IGNORE INTO notification_logs (
             id, user_id, device_id, subscription_id, dedup_key, type, status, error_message, sent_at
           ) VALUES (?, ?, ?, ?, ?, ?, 'sent', NULL, ?)`
        )
          .bind(
            logId,
            row.user_id,
            row.device_id,
            row.sub_id,
            candidate.dedupKey,
            candidate.type,
            nowIso
          )
          .run();

        if (!claimRes.meta.changes) {
          stats.deduplicated += 1;
          continue;
        }

        const sendRes = await sendWebPushWithRetry(
          {
            endpoint: row.endpoint,
            p256dh: row.p256dh,
            auth: row.auth,
          },
          candidate.payload,
          vapid
        );

        if (sendRes.ok) {
          stats.sent += 1;
          await env.DB.prepare(
            `UPDATE push_subscriptions SET last_success_at = ?, fail_count = 0 WHERE id = ?`
          )
            .bind(nowIso, row.sub_id)
            .run();
        } else if (sendRes.expired) {
          stats.expiredDeleted += 1;
          await env.DB.batch([
            env.DB.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).bind(row.sub_id),
            env.DB.prepare(
              `UPDATE notification_logs SET status = 'expired', error_message = ? WHERE id = ?`
            ).bind(sendRes.errorMessage ?? 'Expired (404/410)', logId),
          ]);
          break; // Subscription deleted; stop sending more candidates to it
        } else {
          stats.failed += 1;
          await env.DB.batch([
            env.DB.prepare(
              `UPDATE push_subscriptions SET fail_count = fail_count + 1 WHERE id = ?`
            ).bind(row.sub_id),
            env.DB.prepare(
              `UPDATE notification_logs SET status = 'failed', error_message = ? WHERE id = ?`
            ).bind(sendRes.errorMessage ?? 'Delivery failed', logId),
          ]);
        }
      }
    }
  }

  return stats;
}
