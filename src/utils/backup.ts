import {
  AttendanceRecord,
  AttendanceStatus,
  DepartmentType,
  DesktopScheduleMode,
  ElectiveType,
  ThemeMode,
  UserSettings,
} from '../types';
import {
  BackupValidationResult,
  UniScheduleBackupData,
  UniScheduleBackupV2,
} from '../types/backup';
import { DeadlineItem, DeadlinePriority, LessonNote } from '../types/notes';
import { formatIsoDate, isValidIsoDate, isValidTimeString } from './date';

export const BACKUP_APP_VERSION = '2.0.0';
export const BACKUP_SCHEMA_VERSION = 2;

const VALID_ATTENDANCE_STATUSES = new Set<AttendanceStatus>(['present', 'absent', 'excused']);
const VALID_DEPARTMENTS = new Set<DepartmentType>(['sp', 'oit', 'rks', 'rkt']);
const VALID_ELECTIVES = new Set<ElectiveType>(['freelance', 'management', 'space', 'both']);
const VALID_THEMES = new Set<ThemeMode>(['dark', 'light', 'system']);
const VALID_DESKTOP_MODES = new Set<DesktopScheduleMode>(['day', 'week']);
const VALID_PRIORITIES = new Set<DeadlinePriority>(['normal', 'high']);

const DEFAULT_BACKUP_SETTINGS: UserSettings = {
  subgroup: 1,
  department: 'sp',
  electiveCourse: 'freelance',
  theme: 'dark',
  attendanceGoal: 80,
  showWeekends: false,
  semesterStartDate: '2026-09-01',
  desktopScheduleMode: 'week',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateAttendanceRecord(
  entry: unknown,
  index: number,
  errors: string[]
): AttendanceRecord | null {
  if (!isPlainObject(entry)) {
    errors.push(`Запис відвідуваності #${index + 1} має бути об'єктом.`);
    return null;
  }

  const { lessonId, date, status } = entry;
  if (!isNonEmptyString(lessonId)) {
    errors.push(`Запис відвідуваності #${index + 1}: некоректний lessonId.`);
    return null;
  }
  if (typeof date !== 'string' || !isValidIsoDate(date)) {
    errors.push(`Запис відвідуваності #${index + 1}: некоректна дата "${String(date)}".`);
    return null;
  }
  if (typeof status !== 'string' || !VALID_ATTENDANCE_STATUSES.has(status as AttendanceStatus)) {
    errors.push(`Запис відвідуваності #${index + 1}: невідомий статус "${String(status)}".`);
    return null;
  }

  return {
    lessonId: lessonId.trim(),
    date,
    status: status as AttendanceStatus,
  };
}

function validateSettings(raw: unknown, errors: string[]): UserSettings | null {
  if (!isPlainObject(raw)) {
    errors.push("Поле settings має бути об'єктом.");
    return null;
  }

  const {
    subgroup,
    department,
    electiveCourse,
    theme,
    attendanceGoal,
    showWeekends,
    semesterStartDate,
    desktopScheduleMode,
  } = raw;

  if (subgroup !== 1 && subgroup !== 2) {
    errors.push('Налаштування: subgroup має бути 1 або 2.');
  }
  if (typeof department !== 'string' || !VALID_DEPARTMENTS.has(department as DepartmentType)) {
    errors.push(`Налаштування: некоректна кафедра "${String(department)}".`);
  }
  if (typeof electiveCourse !== 'string' || !VALID_ELECTIVES.has(electiveCourse as ElectiveType)) {
    errors.push(`Налаштування: некоректний вибірковий курс "${String(electiveCourse)}".`);
  }
  if (theme !== undefined && (typeof theme !== 'string' || !VALID_THEMES.has(theme as ThemeMode))) {
    errors.push(`Налаштування: некоректна тема "${String(theme)}".`);
  }
  if (
    attendanceGoal !== undefined &&
    (typeof attendanceGoal !== 'number' ||
      !Number.isFinite(attendanceGoal) ||
      attendanceGoal < 50 ||
      attendanceGoal > 100)
  ) {
    errors.push('Налаштування: attendanceGoal має бути числом від 50 до 100.');
  }
  if (showWeekends !== undefined && typeof showWeekends !== 'boolean') {
    errors.push('Налаштування: showWeekends має бути boolean.');
  }
  if (
    semesterStartDate !== undefined &&
    (typeof semesterStartDate !== 'string' || !isValidIsoDate(semesterStartDate))
  ) {
    errors.push('Налаштування: semesterStartDate має бути у форматі YYYY-MM-DD.');
  }
  if (
    desktopScheduleMode !== undefined &&
    (typeof desktopScheduleMode !== 'string' ||
      !VALID_DESKTOP_MODES.has(desktopScheduleMode as DesktopScheduleMode))
  ) {
    errors.push(`Налаштування: некоректний desktopScheduleMode "${String(desktopScheduleMode)}".`);
  }

  if (errors.length > 0) return null;

  return {
    subgroup: subgroup as 1 | 2,
    department: department as DepartmentType,
    electiveCourse: electiveCourse as ElectiveType,
    theme: (theme as ThemeMode | undefined) ?? 'dark',
    attendanceGoal:
      typeof attendanceGoal === 'number' ? Math.round(attendanceGoal) : 80,
    showWeekends: typeof showWeekends === 'boolean' ? showWeekends : false,
    semesterStartDate:
      typeof semesterStartDate === 'string' ? semesterStartDate : '2026-09-01',
    desktopScheduleMode:
      (desktopScheduleMode as DesktopScheduleMode | undefined) ?? 'week',
  };
}

function validateLessonNote(
  entry: unknown,
  index: number,
  errors: string[]
): LessonNote | null {
  if (!isPlainObject(entry)) {
    errors.push(`Нотатка #${index + 1} має бути об'єктом.`);
    return null;
  }

  const { id, lessonId, date, content, link, deadlineDate, updatedAt } = entry;
  if (!isNonEmptyString(id)) {
    errors.push(`Нотатка #${index + 1}: відсутній коректний id.`);
    return null;
  }
  if (!isNonEmptyString(lessonId)) {
    errors.push(`Нотатка #${index + 1}: відсутній коректний lessonId.`);
    return null;
  }
  if (date !== undefined && (typeof date !== 'string' || !isValidIsoDate(date))) {
    errors.push(`Нотатка #${index + 1}: некоректна дата "${String(date)}".`);
    return null;
  }
  if (typeof content !== 'string') {
    errors.push(`Нотатка #${index + 1}: content має бути рядком.`);
    return null;
  }
  if (link !== undefined && typeof link !== 'string') {
    errors.push(`Нотатка #${index + 1}: link має бути рядком.`);
    return null;
  }
  if (
    deadlineDate !== undefined &&
    (typeof deadlineDate !== 'string' || !isValidIsoDate(deadlineDate))
  ) {
    errors.push(`Нотатка #${index + 1}: некоректна deadlineDate "${String(deadlineDate)}".`);
    return null;
  }
  if (!isNonEmptyString(updatedAt)) {
    errors.push(`Нотатка #${index + 1}: відсутнє поле updatedAt.`);
    return null;
  }

  return {
    id,
    lessonId,
    ...(date !== undefined ? { date } : {}),
    content,
    ...(link !== undefined ? { link } : {}),
    ...(deadlineDate !== undefined ? { deadlineDate } : {}),
    updatedAt,
  };
}

function validateDeadlineItem(
  entry: unknown,
  index: number,
  errors: string[]
): DeadlineItem | null {
  if (!isPlainObject(entry)) {
    errors.push(`Дедлайн #${index + 1} має бути об'єктом.`);
    return null;
  }

  const {
    id,
    title,
    subjectName,
    lessonId,
    dueDate,
    dueTime,
    priority,
    completed,
    notes,
    link,
    createdAt,
    updatedAt,
  } = entry;

  if (!isNonEmptyString(id)) {
    errors.push(`Дедлайн #${index + 1}: відсутній коректний id.`);
    return null;
  }
  if (!isNonEmptyString(title)) {
    errors.push(`Дедлайн #${index + 1}: відсутня назва title.`);
    return null;
  }
  if (subjectName !== undefined && typeof subjectName !== 'string') {
    errors.push(`Дедлайн #${index + 1}: subjectName має бути рядком.`);
    return null;
  }
  if (lessonId !== undefined && typeof lessonId !== 'string') {
    errors.push(`Дедлайн #${index + 1}: lessonId має бути рядком.`);
    return null;
  }
  if (typeof dueDate !== 'string' || !isValidIsoDate(dueDate)) {
    errors.push(`Дедлайн #${index + 1}: некоректна дата dueDate "${String(dueDate)}".`);
    return null;
  }
  if (dueTime !== undefined && (typeof dueTime !== 'string' || !isValidTimeString(dueTime))) {
    errors.push(`Дедлайн #${index + 1}: некоректний час dueTime "${String(dueTime)}".`);
    return null;
  }
  if (typeof priority !== 'string' || !VALID_PRIORITIES.has(priority as DeadlinePriority)) {
    errors.push(`Дедлайн #${index + 1}: некоректний пріоритет "${String(priority)}".`);
    return null;
  }
  if (typeof completed !== 'boolean') {
    errors.push(`Дедлайн #${index + 1}: поле completed має бути boolean.`);
    return null;
  }
  if (notes !== undefined && typeof notes !== 'string') {
    errors.push(`Дедлайн #${index + 1}: notes має бути рядком.`);
    return null;
  }
  if (link !== undefined && typeof link !== 'string') {
    errors.push(`Дедлайн #${index + 1}: link має бути рядком.`);
    return null;
  }
  if (!isNonEmptyString(createdAt)) {
    errors.push(`Дедлайн #${index + 1}: відсутнє поле createdAt.`);
    return null;
  }
  if (updatedAt !== undefined && typeof updatedAt !== 'string') {
    errors.push(`Дедлайн #${index + 1}: updatedAt має бути рядком.`);
    return null;
  }

  return {
    id,
    title: title.trim(),
    ...(subjectName !== undefined ? { subjectName } : {}),
    ...(lessonId !== undefined ? { lessonId } : {}),
    dueDate,
    ...(dueTime !== undefined ? { dueTime } : {}),
    priority: priority as DeadlinePriority,
    completed,
    ...(notes !== undefined ? { notes } : {}),
    ...(link !== undefined ? { link } : {}),
    createdAt,
    ...(updatedAt !== undefined ? { updatedAt } : {}),
  };
}

/** Build a schema-versioned backup payload ready for JSON serialization. */
export function buildBackupPayload(data: UniScheduleBackupData): UniScheduleBackupV2 {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: BACKUP_APP_VERSION,
    data: {
      attendance: [...data.attendance],
      settings: { ...data.settings },
      notes: [...data.notes],
      deadlines: [...data.deadlines],
    },
  };
}

/** Build the default download filename `uni-schedule-backup-YYYY-MM-DD.json`. */
export function formatBackupFilename(date: Date = new Date()): string {
  return `uni-schedule-backup-${formatIsoDate(date)}.json`;
}

/**
 * Parse and strictly validate a JSON backup string.
 * Supports v2 `UniScheduleBackupV2` objects and legacy raw `AttendanceRecord[]` arrays.
 */
export function parseAndValidateBackup(rawJson: string): BackupValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      error: 'Файл не є коректним JSON. Перевірте формат файлу.',
    };
  }

  // Legacy raw AttendanceRecord[] support
  if (Array.isArray(parsed)) {
    const errors: string[] = [];
    const attendance: AttendanceRecord[] = [];
    parsed.forEach((item, index) => {
      const validItem = validateAttendanceRecord(item, index, errors);
      if (validItem) attendance.push(validItem);
    });

    if (errors.length > 0) {
      return {
        valid: false,
        error: 'Масив відвідуваності містить некоректні записи.',
        details: errors.slice(0, 10),
      };
    }

    const backup: UniScheduleBackupV2 = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      appVersion: '1.x',
      data: {
        attendance,
        settings: { ...DEFAULT_BACKUP_SETTINGS },
        notes: [],
        deadlines: [],
      },
    };

    return {
      valid: true,
      format: 'legacy_attendance_v1',
      backup,
      isPartialAttendanceOnly: true,
      counts: {
        attendance: attendance.length,
        notes: 0,
        deadlines: 0,
        hasSettings: false,
      },
      warnings: [
        'Виявлено застарілий формат (лише записи відвідуваності v1). Налаштування, нотатки та дедлайни не будуть змінені у режимі об’єднання.',
      ],
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      error: "Очікувався JSON-об'єкт резервної копії або масив записів відвідуваності.",
    };
  }

  if (typeof parsed.schemaVersion !== 'number' || !Number.isInteger(parsed.schemaVersion)) {
    return {
      valid: false,
      error: 'Відсутнє або некоректне поле schemaVersion.',
    };
  }

  if (parsed.schemaVersion > BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Версія схеми (v${parsed.schemaVersion}) новіша за підтримувану (v${BACKUP_SCHEMA_VERSION}). Оновіть застосунок.`,
    };
  }

  if (parsed.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    return {
      valid: false,
      error: `Непідтримувана версія схеми резервної копії: v${parsed.schemaVersion}.`,
    };
  }

  if (!isPlainObject(parsed.data)) {
    return {
      valid: false,
      error: 'Відсутній або пошкоджений блок data у резервній копії.',
    };
  }

  const rawData = parsed.data;
  const errors: string[] = [];

  if (!Array.isArray(rawData.attendance)) {
    errors.push('Поле data.attendance має бути масивом.');
  }
  if (!Array.isArray(rawData.notes)) {
    errors.push('Поле data.notes має бути масивом.');
  }
  if (!Array.isArray(rawData.deadlines)) {
    errors.push('Поле data.deadlines має бути масивом.');
  }

  const settingsErrors: string[] = [];
  const validatedSettings = validateSettings(rawData.settings, settingsErrors);
  errors.push(...settingsErrors);

  if (errors.length > 0 && (!Array.isArray(rawData.attendance) || !Array.isArray(rawData.notes) || !Array.isArray(rawData.deadlines))) {
    return {
      valid: false,
      error: 'Структура резервної копії пошкоджена.',
      details: errors.slice(0, 10),
    };
  }

  const attendance: AttendanceRecord[] = [];
  (rawData.attendance as unknown[]).forEach((item, index) => {
    const validItem = validateAttendanceRecord(item, index, errors);
    if (validItem) attendance.push(validItem);
  });

  const notes: LessonNote[] = [];
  (rawData.notes as unknown[]).forEach((item, index) => {
    const validItem = validateLessonNote(item, index, errors);
    if (validItem) notes.push(validItem);
  });

  const deadlines: DeadlineItem[] = [];
  (rawData.deadlines as unknown[]).forEach((item, index) => {
    const validItem = validateDeadlineItem(item, index, errors);
    if (validItem) deadlines.push(validItem);
  });

  if (errors.length > 0 || !validatedSettings) {
    return {
      valid: false,
      error: 'Резервна копія містить пошкоджені або невалідні записи.',
      details: errors.slice(0, 10),
    };
  }

  const backup: UniScheduleBackupV2 = {
    schemaVersion: 2,
    exportedAt: isNonEmptyString(parsed.exportedAt)
      ? parsed.exportedAt
      : new Date().toISOString(),
    appVersion: isNonEmptyString(parsed.appVersion)
      ? parsed.appVersion
      : BACKUP_APP_VERSION,
    data: {
      attendance,
      settings: validatedSettings,
      notes,
      deadlines,
    },
  };

  return {
    valid: true,
    format: 'v2',
    backup,
    isPartialAttendanceOnly: false,
    counts: {
      attendance: attendance.length,
      notes: notes.length,
      deadlines: deadlines.length,
      hasSettings: true,
    },
    warnings: [],
  };
}

/** Deduplicate attendance records by `(lessonId, date)` with later items winning. */
export function deduplicateAttendanceRecords(
  records: readonly AttendanceRecord[]
): AttendanceRecord[] {
  const map = new Map<string, AttendanceRecord>();
  for (const record of records) {
    map.set(`${record.lessonId}::${record.date}`, record);
  }
  return Array.from(map.values());
}

function isIncomingTimestampNewer(currentIso: string | undefined, incomingIso: string | undefined): boolean {
  const currentTime = currentIso ? Date.parse(currentIso) : Number.NaN;
  const incomingTime = incomingIso ? Date.parse(incomingIso) : Number.NaN;
  if (Number.isNaN(currentTime) || Number.isNaN(incomingTime)) {
    return true;
  }
  return incomingTime >= currentTime;
}

/** Merge items keyed by `id` where newer timestamps win on collision. */
export function mergeByIdWithTimestamp<T extends { id: string }>(
  current: readonly T[],
  incoming: readonly T[],
  getTimestamp: (item: T) => string | undefined
): T[] {
  const map = new Map<string, T>();
  for (const item of current) {
    map.set(item.id, item);
  }
  for (const item of incoming) {
    const existing = map.get(item.id);
    if (!existing || isIncomingTimestampNewer(getTimestamp(existing), getTimestamp(item))) {
      map.set(item.id, item);
    }
  }
  return Array.from(map.values());
}

/**
 * Safely merge an incoming validated backup into current user data:
 * - Attendance deduplicated by `(lessonId, date)` (incoming wins)
 * - Notes & Deadlines deduplicated by `id` (newer timestamp wins)
 * - Settings merged when `mergeSettings` is true
 */
export function mergeBackups(
  current: UniScheduleBackupData,
  incoming: UniScheduleBackupData,
  options: { mergeSettings?: boolean } = {}
): UniScheduleBackupData {
  const { mergeSettings = true } = options;

  return {
    attendance: deduplicateAttendanceRecords([
      ...current.attendance,
      ...incoming.attendance,
    ]),
    settings: mergeSettings
      ? { ...current.settings, ...incoming.settings }
      : { ...current.settings },
    notes: mergeByIdWithTimestamp(current.notes, incoming.notes, (note) => note.updatedAt),
    deadlines: mergeByIdWithTimestamp(
      current.deadlines,
      incoming.deadlines,
      (deadline) => deadline.updatedAt ?? deadline.createdAt
    ),
  };
}
