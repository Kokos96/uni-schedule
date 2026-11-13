import { AttendanceRecord, Lesson } from '../types';
import { addDays, formatIsoDate, formatShortDateUa, formatYearMonth, getWeekStartIso, parseIsoDate } from './date';
import { filterLessons, LessonFilterProfile, lessonsMap } from './schedule';

export interface AttendanceSummary {
  totalMarked: number;
  present: number;
  absent: number;
  excused: number;
  attended: number; // present + excused
  percentage: number | null; // null when totalMarked === 0 (never fake 100%)
  hasData: boolean;
}

export interface AttendanceTargetResult {
  hasData: boolean;
  attended: number;
  total: number;
  goalPercent: number;
  currentPercent: number | null;
  isMeetingGoal: boolean;
  isGoalReachable: boolean;
  canSkip: number;
  mustAttend: number | null; // null when goalPercent === 100 and attended < total
}

export interface SubjectAttendanceStat extends AttendanceSummary {
  subjectName: string;
  target: AttendanceTargetResult;
}

export interface WeeklyTrendPoint {
  weekStartIso: string;
  weekEndIso: string;
  label: string;
  rangeLabel: string;
  present: number;
  absent: number;
  excused: number;
  attended: number;
  totalMarked: number;
  percentage: number | null;
}

export interface MonthDeltaResult {
  currentYearMonth: string;
  previousYearMonth: string;
  currentMonthPercent: number | null;
  previousMonthPercent: number | null;
  deltaPercent: number | null;
}

/** Filter attendance records to only lessons belonging to the student's profile. */
export function filterRecordsBySettings(
  records: readonly AttendanceRecord[],
  settings: LessonFilterProfile,
  lessonsById: Map<string, Lesson> = lessonsMap
): AttendanceRecord[] {
  return records.filter((record) => {
    const lesson = lessonsById.get(record.lessonId);
    if (!lesson) return false;
    return filterLessons([lesson], settings).length > 0;
  });
}

/** Filter attendance records to a specific "YYYY-MM" month string. */
export function filterRecordsByMonth(
  records: readonly AttendanceRecord[],
  yearMonth: string
): AttendanceRecord[] {
  return records.filter((record) => record.date.startsWith(yearMonth));
}

/** Aggregate attendance counts and percentage (returns percentage: null when empty). */
export function computeAttendanceSummary(
  records: readonly AttendanceRecord[]
): AttendanceSummary {
  let present = 0;
  let absent = 0;
  let excused = 0;

  for (const record of records) {
    if (record.status === 'present') present += 1;
    else if (record.status === 'absent') absent += 1;
    else if (record.status === 'excused') excused += 1;
  }

  const totalMarked = present + absent + excused;
  const attended = present + excused;
  const hasData = totalMarked > 0;
  const percentage = hasData ? Math.round((attended / totalMarked) * 100) : null;

  return {
    totalMarked,
    present,
    absent,
    excused,
    attended,
    percentage,
    hasData,
  };
}

/**
 * Compute attendance goal margin:
 * - `canSkip`: consecutive future classes that can be missed while staying >= goalPercent.
 * - `mustAttend`: consecutive future classes that must be attended to reach >= goalPercent.
 * Uses integer cross-multiplication (`100 * attended` vs `goal * total`) to avoid float rounding drift.
 */
export function computeAttendanceTarget(
  attendedRaw: number,
  totalRaw: number,
  goalPercentRaw: number
): AttendanceTargetResult {
  const total = Math.max(0, Math.floor(totalRaw));
  const attended = Math.min(total, Math.max(0, Math.floor(attendedRaw)));
  const goalPercent = Math.min(100, Math.max(1, Math.round(goalPercentRaw)));

  if (total === 0) {
    return {
      hasData: false,
      attended: 0,
      total: 0,
      goalPercent,
      currentPercent: null,
      isMeetingGoal: false,
      isGoalReachable: true,
      canSkip: 0,
      mustAttend: 0,
    };
  }

  const currentPercent = Math.round((attended / total) * 100);
  const lhs = 100 * attended;
  const rhs = goalPercent * total;
  const isMeetingGoal = lhs >= rhs;

  if (isMeetingGoal) {
    const canSkip = Math.max(0, Math.floor((lhs - rhs) / goalPercent));
    return {
      hasData: true,
      attended,
      total,
      goalPercent,
      currentPercent,
      isMeetingGoal: true,
      isGoalReachable: true,
      canSkip,
      mustAttend: 0,
    };
  }

  if (goalPercent >= 100) {
    return {
      hasData: true,
      attended,
      total,
      goalPercent,
      currentPercent,
      isMeetingGoal: false,
      isGoalReachable: false,
      canSkip: 0,
      mustAttend: null,
    };
  }

  const mustAttend = Math.max(1, Math.ceil((rhs - lhs) / (100 - goalPercent)));
  return {
    hasData: true,
    attended,
    total,
    goalPercent,
    currentPercent,
    isMeetingGoal: false,
    isGoalReachable: true,
    canSkip: 0,
    mustAttend,
  };
}

/** Group attendance records by subject name and compute per-subject summaries + targets. */
export function computeSubjectStats(
  records: readonly AttendanceRecord[],
  lessonsById: Map<string, Lesson> = lessonsMap,
  goalPercent = 80
): SubjectAttendanceStat[] {
  const grouped = new Map<string, AttendanceRecord[]>();

  for (const record of records) {
    const lesson = lessonsById.get(record.lessonId);
    if (!lesson) continue;
    const list = grouped.get(lesson.name);
    if (list) {
      list.push(record);
    } else {
      grouped.set(lesson.name, [record]);
    }
  }

  return Array.from(grouped.entries())
    .map(([subjectName, subjectRecords]) => {
      const summary = computeAttendanceSummary(subjectRecords);
      const target = computeAttendanceTarget(
        summary.attended,
        summary.totalMarked,
        goalPercent
      );
      return {
        subjectName,
        ...summary,
        target,
      };
    })
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'uk'));
}

/**
 * Group attendance records by ISO week (Mon–Fri) and return the last `maxWeeks`
 * active weeks ordered chronologically ascending for SVG trend visualization.
 */
export function computeWeeklyTrends(
  records: readonly AttendanceRecord[],
  maxWeeks = 8
): WeeklyTrendPoint[] {
  const grouped = new Map<string, AttendanceRecord[]>();

  for (const record of records) {
    const weekStartIso = getWeekStartIso(record.date);
    if (!weekStartIso) continue;
    const list = grouped.get(weekStartIso);
    if (list) {
      list.push(record);
    } else {
      grouped.set(weekStartIso, [record]);
    }
  }

  const points: WeeklyTrendPoint[] = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-Math.max(1, maxWeeks))
    .map(([weekStartIso, weekRecords]) => {
      const summary = computeAttendanceSummary(weekRecords);
      const monday = parseIsoDate(weekStartIso);
      const weekEndIso = monday ? formatIsoDate(addDays(monday, 4)) : weekStartIso;
      const startShort = formatShortDateUa(weekStartIso);
      const endShort = formatShortDateUa(weekEndIso);

      return {
        weekStartIso,
        weekEndIso,
        label: startShort,
        rangeLabel: `${startShort}–${endShort}`,
        present: summary.present,
        absent: summary.absent,
        excused: summary.excused,
        attended: summary.attended,
        totalMarked: summary.totalMarked,
        percentage: summary.percentage,
      };
    });

  return points;
}

/** Compare attendance percentage of `referenceDate`'s month against the previous month. */
export function computeMonthDelta(
  records: readonly AttendanceRecord[],
  referenceDate: Date = new Date()
): MonthDeltaResult {
  const currentYearMonth = formatYearMonth(referenceDate);
  const prevMonthDate = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
  const previousYearMonth = formatYearMonth(prevMonthDate);

  const currentSummary = computeAttendanceSummary(
    filterRecordsByMonth(records, currentYearMonth)
  );
  const previousSummary = computeAttendanceSummary(
    filterRecordsByMonth(records, previousYearMonth)
  );

  const deltaPercent =
    currentSummary.percentage !== null && previousSummary.percentage !== null
      ? currentSummary.percentage - previousSummary.percentage
      : null;

  return {
    currentYearMonth,
    previousYearMonth,
    currentMonthPercent: currentSummary.percentage,
    previousMonthPercent: previousSummary.percentage,
    deltaPercent,
  };
}
