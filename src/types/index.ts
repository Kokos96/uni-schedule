export interface UserSettings {
  subgroup: 1 | 2;
  electiveCourse: 'freelance' | 'management' | 'both'; // Freelance або Інноваційний менеджмент
}

// Переконайся, що в interface Lesson є ці опції:
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
  electiveKey?: 'freelance' | 'management';
}