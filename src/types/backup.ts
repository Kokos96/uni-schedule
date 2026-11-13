import { AttendanceRecord, UserSettings } from './index';
import { DeadlineItem, LessonNote } from './notes';

export interface UniScheduleBackupData {
  attendance: AttendanceRecord[];
  settings: UserSettings;
  notes: LessonNote[];
  deadlines: DeadlineItem[];
}

export interface UniScheduleBackupV2 {
  schemaVersion: 2;
  exportedAt: string; // ISO-8601
  appVersion: string; // e.g. "2.0.0"
  data: UniScheduleBackupData;
}

export type BackupImportMode = 'merge' | 'replace';
export type BackupFormat = 'v2' | 'legacy_attendance_v1';

export interface BackupPreviewCounts {
  attendance: number;
  notes: number;
  deadlines: number;
  hasSettings: boolean;
}

export interface BackupValidationSuccess {
  valid: true;
  format: BackupFormat;
  backup: UniScheduleBackupV2;
  isPartialAttendanceOnly: boolean;
  counts: BackupPreviewCounts;
  warnings: string[];
}

export interface BackupValidationError {
  valid: false;
  error: string;
  details?: string[];
}

export type BackupValidationResult = BackupValidationSuccess | BackupValidationError;
