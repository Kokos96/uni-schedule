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
  selected_electives?: string | null;
  selected_track?: number | null;
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
  is_elective?: number;
  elective_key?: string | null;
}

function parseSelectedElectivesList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    }
  } catch {
    // Ignore malformed JSON
  }
  return [];
}

function matchesStudentLessonProfile(
  lesson: {
    subgroup: number | null;
    subject: string;
    is_elective?: number;
    elective_key?: string | null;
  },
  row: Pick<ActiveSubscriptionRow, 'subgroup' | 'selected_electives' | 'selected_track'>
): boolean {
  if (lesson.subgroup !== null && lesson.subgroup !== row.subgroup) {
    return false;
  }
  if (row.selected_track !== null && row.selected_track !== undefined) {
    const trackMatch = lesson.subject.match(/^(\d+)\.\s+\S/);
    if (trackMatch?.[1] && Number.parseInt(trackMatch[1], 10) !== row.selected_track) {
      return false;
    }
  }
  if (lesson.is_elective === 1 && lesson.elective_key) {
    const selected = parseSelectedElectivesList(row.selected_electives);
    if (!selected.includes(lesson.elective_key)) {
      return false;
    }
  }
  return true;
}

function pluralizePairs(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return 'пара';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'пари';
  return 'пар';
}

interface CandidateNotification {
  type: 'morning' | 'before_lesson' | 'before_end' | 'evening' | 'friday';
  dedupKey: string;
  payload: PushPayload;
}

export interface AttendanceSummaryCounts {
  total: number;
  attended: number;
  absent: number;
  excused: number;
  unmarked: number;
}

export interface UserAttendanceEntry {
  lesson_id: string;
  lesson_date: string;
  status: string;
}

export function computeSummaryCounts(
  lessons: ReadonlyArray<{ lesson_id: string; lesson_date: string | null }>,
  attendance: readonly UserAttendanceEntry[],
  fallbackDateIso: string
): AttendanceSummaryCounts {
  const statusMap = new Map<string, string>();
  for (const rec of attendance) {
    statusMap.set(`${rec.lesson_id}:${rec.lesson_date}`, rec.status);
  }

  let attended = 0;
  let absent = 0;
  let excused = 0;
  let unmarked = 0;

  for (const lesson of lessons) {
    const dateKey = lesson.lesson_date ?? fallbackDateIso;
    const status = statusMap.get(`${lesson.lesson_id}:${dateKey}`);
    if (status === 'attended' || status === 'present') {
      attended += 1;
    } else if (status === 'absent') {
      absent += 1;
    } else if (status === 'excused') {
      excused += 1;
    } else {
      // Unmarked or 'unmarked' tombstone is NEVER counted as absent
      unmarked += 1;
    }
  }

  return {
    total: lessons.length,
    attended,
    absent,
    excused,
    unmarked,
  };
}

function formatSummaryLine(counts: AttendanceSummaryCounts): string {
  if (counts.unmarked === counts.total) {
    return `Відміток відвідуваності поки немає (не відмічено: ${counts.unmarked}).`;
  }
  const parts = [`Відвідано: ${counts.attended}`, `пропущено: ${counts.absent}`];
  if (counts.excused > 0) parts.push(`поважна: ${counts.excused}`);
  if (counts.unmarked > 0) parts.push(`не відмічено: ${counts.unmarked}`);
  return parts.join(', ') + '.';
}

export function evaluateNotificationsForUser(
  row: ActiveSubscriptionRow,
  local: LocalDateTimeParts,
  todayLessons: readonly ScheduledLessonRow[],
  weekLessonsCount: number,
  todaySummary?: AttendanceSummaryCounts,
  weekSummary?: AttendanceSummaryCounts
): CandidateNotification[] {
  const candidates: CandidateNotification[] = [];

  // Filter lessons by student's subgroup, track, and selected DVVS electives
  const myTodayLessons = todayLessons
    .filter((l) => matchesStudentLessonProfile(l, row))
    .sort((a, b) => a.pair_number - b.pair_number || a.start_time.localeCompare(b.start_time));

  // 1. Morning digest
  if (row.morning_enabled === 1) {
    const targetMin = hhmmToMinutes(row.morning_time);
    if (targetMin !== null && isTimeInCronWindow(local.minutesOfDay, targetMin)) {
      const first = myTodayLessons[0];
      const body = first
        ? `Сьогодні у тебе ${myTodayLessons.length} ${pluralizePairs(myTodayLessons.length)}\nПерша пара о ${first.start_time} — ${first.subject}. Відкрий розклад для деталей.`
        : 'Сьогодні пар немає\nМожеш спокійно відпочити!';

      candidates.push({
        type: 'morning',
        dedupKey: `${row.sub_id}:morning:${local.isoDate}`,
        payload: {
          title: 'Uni Schedule',
          body,
          tag: `morning-${local.isoDate}`,
          url: `/?date=${local.isoDate}`,
          ttlSeconds: 21600,
          urgency: 'normal',
          actions: [{ action: 'open-schedule', title: 'Відкрити розклад' }],
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
        const roomText = lesson.room ? ` · Аудиторія ${lesson.room}` : '';
        candidates.push({
          type: 'before_lesson',
          dedupKey: `${row.sub_id}:before_lesson:${local.isoDate}:${lesson.lesson_id}@${lesson.start_time}`,
          payload: {
            title: 'Uni Schedule',
            body: `Через ${row.before_lesson_minutes} хв — ${lesson.subject}\n${lesson.start_time}–${lesson.end_time}${roomText}`,
            tag: `before-${lesson.lesson_id}-${local.isoDate}`,
            url: `/?date=${local.isoDate}&lesson=${encodeURIComponent(lesson.lesson_id)}`,
            ttlSeconds: 900,
            urgency: 'high',
            actions: [{ action: 'open-schedule', title: 'Деталі пари' }],
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
            title: 'Uni Schedule',
            body: `До завершення пари ${row.before_end_minutes} хв — ${lesson.subject}\nКінець о ${lesson.end_time}. Не забудь відмітити відвідуваність.`,
            tag: `end-${lesson.lesson_id}-${local.isoDate}`,
            url: `/?date=${local.isoDate}&lesson=${encodeURIComponent(lesson.lesson_id)}`,
            ttlSeconds: 900,
            urgency: 'high',
            actions: [{ action: 'open-schedule', title: 'Відмітити' }],
          },
        });
      }
    }
  }

  // 4. Evening summary (accurate counts from synced attendance_records)
  if (row.evening_enabled === 1 && myTodayLessons.length > 0) {
    const targetMin = hhmmToMinutes(row.evening_time);
    if (targetMin !== null && isTimeInCronWindow(local.minutesOfDay, targetMin)) {
      const counts =
        todaySummary ??
        computeSummaryCounts(myTodayLessons, [], local.isoDate);
      candidates.push({
        type: 'evening',
        dedupKey: `${row.sub_id}:evening:${local.isoDate}`,
        payload: {
          title: 'Uni Schedule',
          body: `Підсумок дня: ${counts.total} ${pluralizePairs(counts.total)}\n${formatSummaryLine(counts)}`,
          tag: `evening-${local.isoDate}`,
          url: '/?tab=stats',
          ttlSeconds: 21600,
          urgency: 'normal',
        },
      });
    }
  }

  // 5. Friday summary (configurable time, only on Fridays with scheduled lessons)
  if (row.friday_enabled === 1 && local.weekday === 5 && weekLessonsCount > 0) {
    const targetMin = hhmmToMinutes(row.friday_time);
    if (targetMin !== null && isTimeInCronWindow(local.minutesOfDay, targetMin)) {
      const counts = weekSummary ?? {
        total: weekLessonsCount,
        attended: 0,
        absent: 0,
        excused: 0,
        unmarked: weekLessonsCount,
      };
      candidates.push({
        type: 'friday',
        dedupKey: `${row.sub_id}:friday:${local.isoDate}`,
        payload: {
          title: 'Uni Schedule',
          body: `Тиждень завершено: ${counts.total} ${pluralizePairs(counts.total)}\n${formatSummaryLine(counts)}`,
          tag: `friday-${local.isoDate}`,
          url: '/?tab=stats',
          ttlSeconds: 21600,
          urgency: 'normal',
        },
      });
    }
  }

  return candidates;
}

export interface CronLatencyMetrics {
  scheduledAt: string;
  cronStartedAt: string;
  cronFinishedAt: string;
  cronLagMs: number;
  processingMs: number;
  pushAvgRttMs: number;
}

export interface CronRunStats {
  checkedSubscriptions: number;
  attempted: number;
  sent: number;
  deduplicated: number;
  expiredDeleted: number;
  failed: number;
  latency: CronLatencyMetrics;
}

const MAX_SUBSCRIPTIONS_PER_TICK = 25;
const MAX_CONCURRENT_DELIVERIES = 10;

export async function runNotificationCron(
  env: Env,
  nowUtc: Date = new Date()
): Promise<CronRunStats> {
  const startedMs = Date.now();
  const scheduledAtIso = nowUtc.toISOString();
  const cronStartedAtIso = new Date(startedMs).toISOString();
  let rttSumMs = 0;
  let rttCount = 0;

  const stats: CronRunStats = {
    checkedSubscriptions: 0,
    attempted: 0,
    sent: 0,
    deduplicated: 0,
    expiredDeleted: 0,
    failed: 0,
    latency: {
      scheduledAt: scheduledAtIso,
      cronStartedAt: cronStartedAtIso,
      cronFinishedAt: cronStartedAtIso,
      cronLagMs: Math.max(0, startedMs - nowUtc.getTime()),
      processingMs: 0,
      pushAvgRttMs: 0,
    },
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
            np.friday_enabled, np.friday_time,
            sp.selected_electives, sp.selected_track
     FROM push_subscriptions ps
     JOIN user_devices ud ON ud.id = ps.device_id AND ud.revoked_at IS NULL
     JOIN student_profiles sp ON sp.user_id = ps.user_id
     JOIN notification_preferences np ON np.user_id = ps.user_id AND np.enabled = 1
     WHERE ps.fail_count < 10
     ORDER BY ps.created_at ASC`
  ).all<ActiveSubscriptionRow>();

  const rows = subsResult.results ?? [];
  stats.checkedSubscriptions = rows.length;

  // Cache schedule lookups per (groupKey, localIsoDate) within this Cron tick
  const dayScheduleCache = new Map<string, ScheduledLessonRow[]>();

  const processSubscription = async (row: ActiveSubscriptionRow) => {
    try {
      const local = getLocalDateTimeParts(nowUtc, row.timezone);
      const groupKey = `${row.university_id}:${row.group_id}`;
      const dayCacheKey = `${groupKey}:${local.isoDate}`;

      let todayLessons = dayScheduleCache.get(dayCacheKey);
      if (!todayLessons) {
        const res = await env.DB.prepare(
          `SELECT lesson_id, lesson_date, day_of_week, pair_number, start_time, end_time,
                  subject, lesson_type, teacher, room, building, subgroup, is_elective, elective_key
           FROM schedule_entries
           WHERE group_id = ? AND (lesson_date = ? OR (lesson_date IS NULL AND day_of_week = ?))`
        )
          .bind(groupKey, local.isoDate, local.weekday)
          .all<ScheduledLessonRow>();
        todayLessons = res.results ?? [];
        dayScheduleCache.set(dayCacheKey, todayLessons);
      }

      let weekLessons: Array<{
        lesson_id: string;
        lesson_date: string | null;
        subgroup: number | null;
        subject: string;
        is_elective?: number;
        elective_key?: string | null;
      }> = [];
      if (local.weekday === 5 && row.friday_enabled === 1) {
        const mondayIso = addDaysToIso(local.isoDate, -4);
        const weekRes = await env.DB.prepare(
          `SELECT lesson_id, lesson_date, subgroup, subject, is_elective, elective_key
           FROM schedule_entries
           WHERE group_id = ? AND (lesson_date BETWEEN ? AND ? OR lesson_date IS NULL)`
        )
          .bind(groupKey, mondayIso, local.isoDate)
          .all<{
            lesson_id: string;
            lesson_date: string | null;
            subgroup: number | null;
            subject: string;
            is_elective?: number;
            elective_key?: string | null;
          }>();
        weekLessons = (weekRes.results ?? []).filter((l) =>
          matchesStudentLessonProfile(l, row)
        );
      }

      const myTodayLessons = todayLessons.filter((l) =>
        matchesStudentLessonProfile(l, row)
      );

      let todaySummary: AttendanceSummaryCounts | undefined;
      const eveningMin = hhmmToMinutes(row.evening_time);
      if (
        row.evening_enabled === 1 &&
        myTodayLessons.length > 0 &&
        eveningMin !== null &&
        isTimeInCronWindow(local.minutesOfDay, eveningMin)
      ) {
        const attRes = await env.DB.prepare(
          `SELECT lesson_id, lesson_date, status
           FROM attendance_records
           WHERE user_id = ? AND lesson_date = ?`
        )
          .bind(row.user_id, local.isoDate)
          .all<UserAttendanceEntry>();
        todaySummary = computeSummaryCounts(
          myTodayLessons,
          attRes.results ?? [],
          local.isoDate
        );
      }

      let weekSummary: AttendanceSummaryCounts | undefined;
      const fridayMin = hhmmToMinutes(row.friday_time);
      if (
        row.friday_enabled === 1 &&
        local.weekday === 5 &&
        weekLessons.length > 0 &&
        fridayMin !== null &&
        isTimeInCronWindow(local.minutesOfDay, fridayMin)
      ) {
        const mondayIso = addDaysToIso(local.isoDate, -4);
        const weekAttRes = await env.DB.prepare(
          `SELECT lesson_id, lesson_date, status
           FROM attendance_records
           WHERE user_id = ? AND lesson_date BETWEEN ? AND ?`
        )
          .bind(row.user_id, mondayIso, local.isoDate)
          .all<UserAttendanceEntry>();
        weekSummary = computeSummaryCounts(
          weekLessons,
          weekAttRes.results ?? [],
          local.isoDate
        );
      }

      const candidates = evaluateNotificationsForUser(
        row,
        local,
        todayLessons,
        weekLessons.length,
        todaySummary,
        weekSummary
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
        if (typeof sendRes.rttMs === 'number') {
          rttSumMs += sendRes.rttMs;
          rttCount += 1;
        }

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
    } catch {
      stats.failed += 1;
    }
  };

  for (let i = 0; i < rows.length; i += MAX_SUBSCRIPTIONS_PER_TICK) {
    const batch = rows.slice(i, i + MAX_SUBSCRIPTIONS_PER_TICK);
    for (let j = 0; j < batch.length; j += MAX_CONCURRENT_DELIVERIES) {
      await Promise.allSettled(
        batch.slice(j, j + MAX_CONCURRENT_DELIVERIES).map((row) => processSubscription(row))
      );
    }
  }

  const finishedMs = Date.now();
  stats.latency = {
    scheduledAt: scheduledAtIso,
    cronStartedAt: cronStartedAtIso,
    cronFinishedAt: new Date(finishedMs).toISOString(),
    cronLagMs: Math.max(0, startedMs - nowUtc.getTime()),
    processingMs: Math.max(0, finishedMs - startedMs),
    pushAvgRttMs: rttCount > 0 ? Math.round(rttSumMs / rttCount) : 0,
  };

  if (stats.checkedSubscriptions > 0 || stats.attempted > 0) {
    console.info(
      JSON.stringify({
        event: 'cron_tick',
        checked: stats.checkedSubscriptions,
        attempted: stats.attempted,
        sent: stats.sent,
        dedup: stats.deduplicated,
        failed: stats.failed,
        processingMs: stats.latency.processingMs,
        pushAvgRttMs: stats.latency.pushAvgRttMs,
      })
    );
  }

  return stats;
}
