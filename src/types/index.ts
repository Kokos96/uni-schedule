export type WeekType = 'numerator' | 'denominator' | 'both';
export type LessonType = 'Лекція' | 'Практична' | 'Лабораторна';
export type AttendanceStatus = 'present' | 'absent' | 'excused';

export type DepartmentType = 'sp' | 'oit' | 'rks' | 'rkt';
export type ElectiveType = 'freelance' | 'management' | 'space' | 'both';

export interface UserSettings {
  subgroup: 1 | 2;
  department: DepartmentType;
  electiveCourse: ElectiveType;
}

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
  electiveKey?: 'freelance' | 'management' | 'space';
  departments?: DepartmentType[]; // Які кафедри відвідують пару
}

export interface AttendanceRecord {
  lessonId: string;
  date: string; // "YYYY-MM-DD"
  status: AttendanceStatus;
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
  floor: number;
}