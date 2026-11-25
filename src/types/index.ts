import type { StudentSelection } from '../integrations/universities/types';

export type WeekType = 'numerator' | 'denominator' | 'both';
export type WeekParity = Exclude<WeekType, 'both'>;
export type LessonType = 'Лекція' | 'Практична' | 'Лабораторна';
export type AttendanceStatus = 'present' | 'absent' | 'excused';

export type DepartmentType = 'sp' | 'oit' | 'rks' | 'rkt';
export type ElectiveType = 'freelance' | 'management' | 'space' | 'both';
export type ThemeMode = 'dark' | 'light' | 'system';
export type DesktopScheduleMode = 'day' | 'week';
export type ScheduleSourceMode = 'unconfigured' | 'builtin' | 'live' | 'manual';

export interface UserSettings {
  // Preserved v1.x required fields
  subgroup: 1 | 2;
  department: DepartmentType;
  electiveCourse: ElectiveType;
  // v2.0 optional extensions (defaulted on read)
  theme?: ThemeMode;
  attendanceGoal?: number;
  showWeekends?: boolean;
  semesterStartDate?: string;
  desktopScheduleMode?: DesktopScheduleMode;
  universityProfile?: StudentSelection;
  /** Explicit academic schedule choice, independent of cache availability. */
  scheduleSourceMode?: ScheduleSourceMode;
  /** Selected live DVVS elective keys (e.g. `el_...`) for synced schedules */
  selectedElectives?: string[];
  /** Selected numbered specialization/department track (e.g. 1 or 2) */
  selectedTrack?: number;
}

export type ResolvedUserSettings = Required<
  Omit<UserSettings, 'universityProfile' | 'selectedElectives' | 'selectedTrack'>
> & {
  universityProfile?: StudentSelection;
  selectedElectives?: string[];
  selectedTrack?: number;
};

export interface Lesson {
  id: string;
  order: number;
  startTime: string;
  endTime: string;
  name: string;
  type: LessonType;
  teacherId: string;
  classroomId: string;
  weekType: WeekType;
  subgroup?: 1 | 2;
  isElective?: boolean;
  electiveKey?: string;
  trackNumber?: number;
  groupLabel?: string;
  departments?: DepartmentType[]; // Які кафедри відвідують пару
}

export interface ScheduleDay {
  dayNumber: number;
  dayName: string;
  lessons: Lesson[];
}

export interface AttendanceRecord {
  lessonId: string;
  date: string; // "YYYY-MM-DD" in local calendar time
  status: AttendanceStatus;
  updatedAt?: string; // ISO timestamp for multi-device LWW sync
  serverVersion?: number;
}

export interface Teacher {
  id: string;
  fullName: string;
  department: string;
  subjects: string[];
}

export interface Classroom {
  id: string;
  code: string;
  building: string;
  floor?: number;
}
