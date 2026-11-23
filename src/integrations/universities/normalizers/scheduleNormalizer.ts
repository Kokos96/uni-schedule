import type {
  Classroom,
  Lesson,
  LessonType,
  ScheduleDay,
  Teacher,
  WeekType,
} from '../../../types';
import { DAY_NAMES_UA_FULL, parseIsoDate } from '../../../utils/date';
import type { NormalizedSchedule, ScheduleLesson } from '../types';

/**
 * Generates a compact, deterministic, ASCII-safe slug from Ukrainian/Latin text.
 * Uses a fast FNV-1a 32-bit hash so Cyrillic subjects stay short and collision-resistant.
 */
export function stableSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[`'’"]/g, '');

  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Builds a stable `lessonId` that is invariant to teacher, room, or building changes.
 * Only identity-defining coordinates (university, group, weekday, pair order,
 * normalized subject, subgroup) are included so attendance history is preserved
 * across schedule updates (Clarification #2).
 */
export function buildStableLessonId(params: {
  universityId: string;
  groupId: string;
  dayOfWeek: number;
  pairNumber: number;
  subject: string;
  subgroup?: 1 | 2;
  weekType?: WeekType;
}): string {
  const groupSlug = stableSlug(params.groupId);
  const subjectSlug = stableSlug(params.subject);
  const sub = params.subgroup ? `s${params.subgroup}` : 'all';
  const parity = params.weekType && params.weekType !== 'both' ? params.weekType.slice(0, 3) : 'b';
  return `${params.universityId}_${groupSlug}_d${params.dayOfWeek}_p${params.pairNumber}_${subjectSlug}_${sub}_${parity}`;
}

export function normalizeLessonType(rawType: string): LessonType {
  const clean = rawType.trim().toLowerCase();
  if (clean.startsWith('лаб')) return 'Лабораторна';
  if (
    clean.startsWith('прак') ||
    clean === 'п' ||
    clean.startsWith('сем')
  ) {
    return 'Практична';
  }
  return 'Лекція';
}

export function parseRoomCodeAndBuilding(rawRoom: string): {
  code: string;
  building: string;
} {
  const cleaned = rawRoom.replace(/\u00a0/g, ' ').trim();
  if (!cleaned) {
    return { code: '—', building: 'Університет' };
  }
  const slashIdx = cleaned.lastIndexOf('/');
  if (slashIdx > 0 && slashIdx < cleaned.length - 1) {
    return {
      code: cleaned,
      building: `Корпус ${cleaned.slice(slashIdx + 1).trim()}`,
    };
  }
  return { code: cleaned, building: 'Корпус' };
}

export interface AppScheduleBundle {
  schedule: ScheduleDay[];
  teachers: Teacher[];
  classrooms: Classroom[];
  /** Optional dated lookup ("YYYY-MM-DD" -> Lesson[]) when source provides exact dates. */
  datedLessonsByIso: Record<string, Lesson[]>;
}

/**
 * Converts a normalized university schedule into the existing `ScheduleDay[]`,
 * `Teacher[]`, and `Classroom[]` structures consumed by Uni Schedule UI components.
 */
export function toAppScheduleBundle(
  normalized: NormalizedSchedule
): AppScheduleBundle {
  const teachersById = new Map<string, Teacher>();
  const classroomsById = new Map<string, Classroom>();
  const daysMap = new Map<number, Map<string, Lesson>>();
  const datedLessonsByIso: Record<string, Lesson[]> = {};

  for (let d = 1; d <= 7; d += 1) {
    daysMap.set(d, new Map());
  }

  for (const item of normalized.lessons) {
    const teacherName = item.teacher?.trim() ?? '';
    let teacherId = '';
    if (teacherName) {
      teacherId = `t_${stableSlug(teacherName)}`;
      const existingTeacher = teachersById.get(teacherId);
      if (existingTeacher) {
        if (!existingTeacher.subjects.includes(item.subject)) {
          existingTeacher.subjects.push(item.subject);
        }
      } else {
        teachersById.set(teacherId, {
          id: teacherId,
          fullName: teacherName,
          department: normalized.universityName,
          subjects: [item.subject],
        });
      }
    }

    const rawRoom = item.room?.replace(/\u00a0/g, ' ').trim() ?? '';
    let classroomId = '';
    if (rawRoom) {
      const roomInfo = parseRoomCodeAndBuilding(rawRoom);
      classroomId = `c_${stableSlug(roomInfo.code)}`;
      if (!classroomsById.has(classroomId)) {
        classroomsById.set(classroomId, {
          id: classroomId,
          code: roomInfo.code,
          building: item.building || roomInfo.building,
          floor: 1,
        });
      }
    }

    const lessonId =
      item.id ||
      buildStableLessonId({
        universityId: normalized.universityId,
        groupId: normalized.groupId,
        dayOfWeek: item.dayOfWeek,
        pairNumber: item.number,
        subject: item.subject,
        subgroup: item.subgroup,
      });

    const appLesson: Lesson = {
      id: lessonId,
      order: item.number,
      startTime: item.startTime,
      endTime: item.endTime,
      name: item.subject,
      type: normalizeLessonType(item.lessonType),
      teacherId,
      classroomId,
      weekType: item.weekType ?? 'both',
      ...(item.subgroup ? { subgroup: item.subgroup } : {}),
      ...(item.isElective ? { isElective: true } : {}),
      ...(item.electiveKey ? { electiveKey: item.electiveKey } : {}),
      ...(item.trackNumber !== undefined ? { trackNumber: item.trackNumber } : {}),
      ...(item.groupLabel ? { groupLabel: item.groupLabel } : {}),
    };

    const dayBucket = daysMap.get(item.dayOfWeek);
    const bucketKey = `${lessonId}:${appLesson.type}`;
    if (dayBucket && !dayBucket.has(bucketKey)) {
      dayBucket.set(bucketKey, appLesson);
    }

    if (item.date && parseIsoDate(item.date)) {
      const list = datedLessonsByIso[item.date] ?? [];
      if (!list.some((existing) => existing.id === lessonId && existing.type === appLesson.type)) {
        list.push(appLesson);
        list.sort((a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime));
        datedLessonsByIso[item.date] = list;
      }
    }
  }

  const schedule: ScheduleDay[] = [];
  for (let dayNumber = 1; dayNumber <= 7; dayNumber += 1) {
    const lessons = Array.from(daysMap.get(dayNumber)?.values() ?? []).sort(
      (a, b) => a.order - b.order || a.startTime.localeCompare(b.startTime)
    );
    schedule.push({
      dayNumber,
      dayName: DAY_NAMES_UA_FULL[dayNumber] ?? `День ${dayNumber}`,
      lessons,
    });
  }

  return {
    schedule,
    teachers: Array.from(teachersById.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'uk')
    ),
    classrooms: Array.from(classroomsById.values()).sort((a, b) =>
      a.code.localeCompare(b.code, 'uk')
    ),
    datedLessonsByIso,
  };
}

export function extractDayOfWeekFromIso(isoDate: string): number {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return 1;
  const jsDay = parsed.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function isLessonCancelled(lesson: Pick<ScheduleLesson, 'status'>): boolean {
  return lesson.status === 'cancelled';
}
