import type { NormalizedSchedule, StudentSelection } from '../integrations/universities/types';
import { readStorage, removeStorage, writeStorage } from '../utils/storage';

const CACHE_KEY = 'uni_schedule_cached_group_v3';
const LEGACY_KEYS = ['uni_schedule_cached_group_v2', 'uni_schedule_cached_group_v1'] as const;
const MAX_ENTRIES = 8;
export const SCHEDULE_REFRESH_MS = 6 * 60 * 60 * 1000;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`));
}

export function scheduleIdentity(profile: Pick<StudentSelection, 'universityId' | 'facultyId' | 'groupId'>): string {
  return JSON.stringify([profile.universityId.trim(), profile.facultyId?.trim() ?? '', profile.groupId.trim()]);
}

export function isValidCachedSchedule(value: unknown): value is NormalizedSchedule {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Partial<NormalizedSchedule>;
  if (!schedule.universityId || !schedule.groupId ||
      typeof schedule.universityId !== 'string' || typeof schedule.groupId !== 'string' ||
      (schedule.facultyId !== undefined && typeof schedule.facultyId !== 'string') ||
      typeof schedule.fetchedAt !== 'string' || Number.isNaN(Date.parse(schedule.fetchedAt)) ||
      !Array.isArray(schedule.warnings) || !Array.isArray(schedule.lessons) ||
      schedule.lessons.length === 0) return false;
  if (schedule.sourceType !== undefined && schedule.sourceType !== 'dated' && schedule.sourceType !== 'recurring') return false;
  if (schedule.coveredFrom !== undefined && !isIsoDate(schedule.coveredFrom)) return false;
  if (schedule.coveredTo !== undefined && !isIsoDate(schedule.coveredTo)) return false;
  if (schedule.coveredFrom && schedule.coveredTo && schedule.coveredFrom > schedule.coveredTo) return false;
  return schedule.lessons.every((lesson) => lesson && typeof lesson === 'object' &&
    typeof lesson.id === 'string' && typeof lesson.subject === 'string' &&
    typeof lesson.startTime === 'string' && typeof lesson.endTime === 'string' &&
    (lesson.date === undefined || isIsoDate(lesson.date)));
}

function readEntries(): Record<string, NormalizedSchedule> {
  const value = readStorage<unknown>(CACHE_KEY, null);
  if (!value || typeof value !== 'object') return {};
  const envelope = value as { schemaVersion?: unknown; entries?: unknown };
  if (envelope.schemaVersion !== 3 || !envelope.entries || typeof envelope.entries !== 'object') return {};
  const entries: Record<string, NormalizedSchedule> = {};
  for (const [key, schedule] of Object.entries(envelope.entries)) {
    if (isValidCachedSchedule(schedule) && key === scheduleIdentity(schedule)) entries[key] = schedule;
  }
  return entries;
}

export function readCachedSchedule(profile: StudentSelection | undefined): NormalizedSchedule | null {
  if (!profile) return null;
  const key = scheduleIdentity(profile);
  const current = readEntries()[key];
  if (current) return current;
  for (const legacyKey of LEGACY_KEYS) {
    const value = readStorage<unknown>(legacyKey, null);
    const candidate = legacyKey.endsWith('_v2') && value && typeof value === 'object'
      ? (value as { schemaVersion?: unknown; schedule?: unknown }).schemaVersion === 2
        ? (value as { schedule?: unknown }).schedule : null
      : value;
    if (isValidCachedSchedule(candidate) && scheduleIdentity(candidate) === key) {
      // Existing dated entries remain available offline; unknown coverage stays unknown.
      const migrated: NormalizedSchedule = {
        ...candidate,
        sourceType: candidate.sourceType ?? (candidate.lessons.some((lesson) => lesson.date) ? 'dated' : 'recurring'),
      };
      writeCachedSchedule(migrated);
      return migrated;
    }
  }
  return null;
}

export function writeCachedSchedule(schedule: NormalizedSchedule): boolean {
  if (!isValidCachedSchedule(schedule)) return false;
  const entries = readEntries();
  entries[scheduleIdentity(schedule)] = schedule;
  const bounded = Object.fromEntries(Object.entries(entries)
    .sort((a, b) => Date.parse(b[1].fetchedAt) - Date.parse(a[1].fetchedAt))
    .slice(0, MAX_ENTRIES));
  return writeStorage(CACHE_KEY, { schemaVersion: 3, entries: bounded }).ok;
}

export function clearCachedSchedules(): void {
  removeStorage(CACHE_KEY);
  for (const key of LEGACY_KEYS) removeStorage(key);
}

export function shouldRefreshSchedule(schedule: NormalizedSchedule | null, todayIso: string, now = Date.now()): boolean {
  if (!schedule) return true;
  if (now - Date.parse(schedule.fetchedAt) >= SCHEDULE_REFRESH_MS) return true;
  const isDated = schedule.sourceType === 'dated' || schedule.lessons.some((lesson) => lesson.date);
  return isDated && (!schedule.coveredFrom || !schedule.coveredTo ||
    todayIso < schedule.coveredFrom || todayIso > schedule.coveredTo);
}
