import scheduleJson from '../data/schedule.json';
import teachersJson from '../data/teachers.json';
import classroomsJson from '../data/classrooms.json';
import {
  Classroom,
  Lesson,
  ScheduleDay,
  Teacher,
  UserSettings,
  WeekParity,
} from '../types';
import {
  formatIsoDate,
  getScheduleDayNumber,
  getWeekParity,
  timeStringToMinutes,
} from './date';

export { getWeekParity };

export type LessonFilterProfile = Pick<
  UserSettings,
  'subgroup' | 'department' | 'electiveCourse' | 'selectedElectives' | 'selectedTrack'
>;

export interface TimeSlot {
  order: number;
  startTime: string;
  endTime: string;
}

export interface WeekGridDayColumn {
  dayNumber: number;
  dayName: string;
  date: Date;
  isoDate: string;
  lessons: Lesson[];
  lessonsByOrder: Record<number, Lesson[]>;
}

export interface WeekGridData {
  days: WeekGridDayColumn[];
  slots: TimeSlot[];
  activeSlotOrders: number[];
}

export const PAIR_TIME_SLOTS: readonly TimeSlot[] = [
  { order: 1, startTime: '08:30', endTime: '09:50' },
  { order: 2, startTime: '10:10', endTime: '11:30' },
  { order: 3, startTime: '11:50', endTime: '13:10' },
  { order: 4, startTime: '13:30', endTime: '14:50' },
  { order: 5, startTime: '15:05', endTime: '16:25' },
  { order: 6, startTime: '16:40', endTime: '18:00' },
  { order: 7, startTime: '18:10', endTime: '19:30' },
  { order: 8, startTime: '19:40', endTime: '21:00' },
];

const UK_DAY_NAMES: Record<number, string> = {
  1: 'Понеділок',
  2: 'Вівторок',
  3: 'Середа',
  4: 'Четвер',
  5: "П'ятниця",
  6: 'Субота',
  7: 'Неділя',
};

export const scheduleData = scheduleJson as ScheduleDay[];
export const teachersData = teachersJson as Teacher[];
export const classroomsData = classroomsJson as Classroom[];

/** Build a fast O(1) Teacher lookup map keyed by teacher ID. */
export function createTeachersMap(teachers: readonly Teacher[]): Map<string, Teacher> {
  return new Map(teachers.map((teacher) => [teacher.id, teacher]));
}

/** Build a fast O(1) Classroom lookup map keyed by classroom ID. */
export function createClassroomsMap(
  classrooms: readonly Classroom[]
): Map<string, Classroom> {
  return new Map(classrooms.map((classroom) => [classroom.id, classroom]));
}

/** Build a fast O(1) Lesson lookup map keyed by lesson ID across all schedule days. */
export function createLessonsMap(
  schedule: readonly ScheduleDay[]
): Map<string, Lesson> {
  const map = new Map<string, Lesson>();
  for (const day of schedule) {
    for (const lesson of day.lessons) {
      map.set(lesson.id, lesson);
    }
  }
  return map;
}

export const teachersMap: Map<string, Teacher> = createTeachersMap(teachersData);
export const classroomsMap: Map<string, Classroom> = createClassroomsMap(classroomsData);
export const lessonsMap: Map<string, Lesson> = createLessonsMap(scheduleData);
export const allLessons: Lesson[] = scheduleData.flatMap((day) => day.lessons);

export function getTeacherById(teacherId: string): Teacher | undefined {
  return teachersMap.get(teacherId);
}

export function getClassroomById(classroomId: string): Classroom | undefined {
  return classroomsMap.get(classroomId);
}

export function getLessonById(lessonId: string): Lesson | undefined {
  return lessonsMap.get(lessonId);
}

/** Retrieve raw lessons for a schedule day number (1=Mon .. 7=Sun). */
export function getDayLessons(
  dayNumber: number,
  schedule: readonly ScheduleDay[] = scheduleData
): Lesson[] {
  const day = schedule.find((entry) => entry.dayNumber === dayNumber);
  return day ? day.lessons : [];
}

/**
 * Filter lessons by student profile (subgroup, department, electiveCourse)
 * and optionally by week parity ('numerator' | 'denominator').
 */
export function filterLessons(
  lessons: readonly Lesson[],
  settings: LessonFilterProfile,
  weekParity?: WeekParity
): Lesson[] {
  return lessons
    .filter((lesson) => {
      if (lesson.subgroup && lesson.subgroup !== settings.subgroup) {
        return false;
      }
      if (lesson.departments && !lesson.departments.includes(settings.department)) {
        return false;
      }
      if (
        lesson.trackNumber !== undefined &&
        settings.selectedTrack !== undefined &&
        lesson.trackNumber !== settings.selectedTrack
      ) {
        return false;
      }
      if (lesson.isElective) {
        if (lesson.electiveKey?.startsWith('el_')) {
          const selected = settings.selectedElectives ?? [];
          if (!selected.includes(lesson.electiveKey)) {
            return false;
          }
        } else if (settings.electiveCourse !== 'both') {
          if (lesson.electiveKey && lesson.electiveKey !== settings.electiveCourse) {
            return false;
          }
        }
      }
      if (weekParity && lesson.weekType !== 'both' && lesson.weekType !== weekParity) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return timeStringToMinutes(a.startTime) - timeStringToMinutes(b.startTime);
    });
}

/** Return sorted unique subject names matching the student's active profile. */
export function getSubjectsForSettings(
  settings: LessonFilterProfile,
  schedule: readonly ScheduleDay[] = scheduleData
): string[] {
  const names = new Set<string>();
  for (const day of schedule) {
    const filtered = filterLessons(day.lessons, settings);
    for (const lesson of filtered) {
      names.add(lesson.name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'uk'));
}

/**
 * Build the Desktop 5-column (or 7-column) Week Grid matrix grouped by slot order.
 */
export function buildWeekGrid(
  schedule: readonly ScheduleDay[],
  settings: LessonFilterProfile,
  weekDates: readonly Date[],
  weekParity?: WeekParity,
  datedLessonsByIso?: Readonly<Record<string, readonly Lesson[]>>
): WeekGridData {
  const activeOrdersSet = new Set<number>();

  const days: WeekGridDayColumn[] = weekDates.map((date) => {
    const isoDate = formatIsoDate(date);
    const dayNumber = getScheduleDayNumber(date);
    const dayData = schedule.find((entry) => entry.dayNumber === dayNumber);
    const dayName = dayData?.dayName ?? UK_DAY_NAMES[dayNumber] ?? '';
    const sourceLessons = datedLessonsByIso?.[isoDate] ?? dayData?.lessons ?? [];
    const filtered = filterLessons(sourceLessons, settings, weekParity);

    const lessonsByOrder: Record<number, Lesson[]> = {};
    for (const lesson of filtered) {
      activeOrdersSet.add(lesson.order);
      const bucket = lessonsByOrder[lesson.order] ?? [];
      bucket.push(lesson);
      lessonsByOrder[lesson.order] = bucket;
    }

    return {
      dayNumber,
      dayName,
      date,
      isoDate,
      lessons: filtered,
      lessonsByOrder,
    };
  });

  const activeSlotOrders = Array.from(activeOrdersSet).sort((a, b) => a - b);

  return {
    days,
    slots: [...PAIR_TIME_SLOTS],
    activeSlotOrders,
  };
}
