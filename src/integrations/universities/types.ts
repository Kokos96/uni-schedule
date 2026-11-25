export type IntegrationSupportStatus = 'live' | 'manual_only';

export type ScheduleLessonStatus =
  | 'active'
  | 'cancelled'
  | 'rescheduled'
  | 'room_changed';

export interface Faculty {
  id: string;
  name: string;
}

export interface Program {
  id: string;
  facultyId: string;
  name: string;
}

export interface Course {
  id: string;
  number: number;
  label: string;
}

export interface Group {
  id: string;
  name: string;
  facultyId?: string;
  course?: number;
  externalId?: string;
}

export interface Subgroup {
  id: string;
  label: string;
  value: 1 | 2;
}

export interface StudentSelection {
  universityId: string;
  facultyId?: string;
  facultyName?: string;
  programId?: string;
  course?: number;
  groupId: string;
  groupName: string;
  subgroup?: 1 | 2;
}

export interface ScheduleLesson {
  id: string;
  date?: string; // "YYYY-MM-DD" when sourced from dated calendar HTML
  dayOfWeek: number; // 1..7 (Mon..Sun)
  number: number; // Pair order 1..8
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
  subject: string;
  lessonType: string;
  teacher?: string;
  room?: string;
  building?: string;
  address?: string;
  group?: string;
  groupLabel?: string;
  subgroup?: 1 | 2;
  isElective?: boolean;
  electiveKey?: string;
  trackNumber?: number;
  weekType?: 'numerator' | 'denominator' | 'both';
  status?: ScheduleLessonStatus;
  universityId: string;
  sourceId?: string;
  updatedAt?: string;
}

export interface NormalizedSchedule {
  universityId: string;
  universityName: string;
  facultyId?: string;
  groupId: string;
  groupName: string;
  fetchedAt: string;
  sourceType?: 'dated' | 'recurring';
  coveredFrom?: string;
  coveredTo?: string;
  sourceUrl?: string;
  lessons: ScheduleLesson[];
  warnings: string[];
}

export interface UniversityCapabilities {
  hasFaculties: boolean;
  hasPrograms: boolean;
  hasCourses: boolean;
  hasGroups: boolean;
  hasSubgroups: boolean;
}

export interface UniversityMeta {
  id: string;
  name: string;
  shortName: string;
  city: string;
  supportStatus: IntegrationSupportStatus;
  capabilities: UniversityCapabilities;
  sourceNote: string;
}

export interface UniversityAdapter {
  readonly meta: UniversityMeta;

  getFaculties(): Promise<Faculty[]>;
  getPrograms?(facultyId: string): Promise<Program[]>;
  getCourses(facultyId?: string, programId?: string): Promise<Course[]>;
  getGroups(filter?: {
    facultyId?: string;
    programId?: string;
    course?: number;
  }): Promise<Group[]>;
  getSubgroups?(groupId: string): Promise<Subgroup[]>;
  fetchSchedule(selection: StudentSelection, options?: { force?: boolean }): Promise<NormalizedSchedule>;
}
