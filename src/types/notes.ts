export interface LessonNote {
  id: string;
  lessonId: string;
  date?: string;         // "YYYY-MM-DD" for date-specific note, omitted for general subject note
  content: string;
  link?: string;         // optional external resource / classroom link
  deadlineDate?: string; // optional "YYYY-MM-DD" homework due date
  updatedAt: string;     // ISO-8601
}

export interface SaveNoteInput {
  id?: string;
  lessonId: string;
  date?: string;
  content: string;
  link?: string;
  deadlineDate?: string;
}

export type DeadlinePriority = 'normal' | 'high';
export type DeadlineFilter = 'active' | 'overdue' | 'completed' | 'all';

export interface DeadlineItem {
  id: string;
  title: string;
  subjectName?: string;
  lessonId?: string;
  dueDate: string;    // "YYYY-MM-DD"
  dueTime?: string;   // "HH:mm"
  priority: DeadlinePriority;
  completed: boolean;
  notes?: string;
  link?: string;
  createdAt: string;  // ISO-8601
  updatedAt?: string; // ISO-8601
}

export interface CreateDeadlineInput {
  title: string;
  dueDate: string;
  dueTime?: string;
  priority?: DeadlinePriority;
  subjectName?: string;
  lessonId?: string;
  notes?: string;
  link?: string;
  completed?: boolean;
}

export type UpdateDeadlinePatch = Partial<Omit<DeadlineItem, 'id' | 'createdAt'>>;
