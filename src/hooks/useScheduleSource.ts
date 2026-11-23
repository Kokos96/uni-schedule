import { useCallback, useEffect, useMemo, useState } from 'react';
import { getUniversityAdapter } from '../integrations/universities/registry';
import { toAppScheduleBundle } from '../integrations/universities/normalizers/scheduleNormalizer';
import type {
  NormalizedSchedule,
  StudentSelection,
} from '../integrations/universities/types';
import type {
  Classroom,
  Lesson,
  ResolvedUserSettings,
  ScheduleDay,
  Teacher,
  WeekParity,
} from '../types';
import { formatIsoDate, getScheduleDayNumber } from '../utils/date';
import {
  classroomsData,
  classroomsMap as defaultClassroomsMap,
  createClassroomsMap,
  createLessonsMap,
  createTeachersMap,
  filterLessons,
  getDayLessons,
  lessonsMap as defaultLessonsMap,
  scheduleData,
  teachersData,
  teachersMap as defaultTeachersMap,
} from '../utils/schedule';
import { readStorage, writeStorage } from '../utils/storage';

const CACHED_GROUP_SCHEDULE_KEY = 'uni_schedule_cached_group_v2';
const LEGACY_GROUP_SCHEDULE_KEY = 'uni_schedule_cached_group_v1';

function isValidCachedSchedule(value: unknown): value is NormalizedSchedule {
  if (!value || typeof value !== 'object') return false;
  const schedule = value as Partial<NormalizedSchedule>;
  return (
    typeof schedule.universityId === 'string' &&
    schedule.universityId.length > 0 &&
    typeof schedule.groupId === 'string' &&
    schedule.groupId.length > 0 &&
    typeof schedule.fetchedAt === 'string' &&
    schedule.fetchedAt.length > 0 &&
    (schedule.facultyId === undefined || typeof schedule.facultyId === 'string') &&
    Array.isArray(schedule.lessons) &&
    schedule.lessons.length > 0 &&
    schedule.lessons.every(
      (lesson) =>
        Boolean(lesson) &&
        typeof lesson === 'object' &&
        typeof lesson.subject === 'string' &&
        typeof lesson.startTime === 'string'
    ) &&
    Array.isArray(schedule.warnings)
  );
}

function isCacheMatchingProfile(
  cachedSchedule: NormalizedSchedule | null,
  profile: StudentSelection | undefined
): boolean {
  if (!profile || !cachedSchedule) return false;
  return (
    cachedSchedule.universityId === profile.universityId &&
    cachedSchedule.groupId === profile.groupId &&
    (cachedSchedule.facultyId ?? '') === (profile.facultyId ?? '') &&
    cachedSchedule.lessons.length > 0
  );
}

function readCachedSchedule(): NormalizedSchedule | null {
  const current = readStorage<unknown>(CACHED_GROUP_SCHEDULE_KEY, null);
  if (current && typeof current === 'object') {
    const envelope = current as { schemaVersion?: unknown; schedule?: unknown };
    if (envelope.schemaVersion === 2 && isValidCachedSchedule(envelope.schedule)) {
      return envelope.schedule;
    }
  }
  const legacy = readStorage<unknown>(LEGACY_GROUP_SCHEDULE_KEY, null);
  return isValidCachedSchedule(legacy) ? legacy : null;
}

export type ScheduleSyncStatus = 'builtin' | 'idle' | 'syncing' | 'synced' | 'error' | 'manual';
export type ScheduleDateAvailability = 'loaded' | 'free_day' | 'outside_coverage' | 'not_loaded';

export interface ScheduleSourceState {
  schedule: ScheduleDay[];
  teachers: Teacher[];
  classrooms: Classroom[];
  scheduleMap: Map<string, Lesson>;
  teachersMap: Map<string, Teacher>;
  classroomsMap: Map<string, Classroom>;
  datedLessonsByIso: Record<string, Lesson[]> | null;
  availableElectives: Array<{ key: string; subject: string }>;
  availableTracks: Array<{ number: number; subjects: string[] }>;
  hasSubgroups: boolean;
  isUsingCustomGroup: boolean;
  syncStatus: ScheduleSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  syncWarnings: string[];
  getLessonsForDate: (date: Date, parity: WeekParity) => Lesson[];
  getDateAvailability: (date: Date) => ScheduleDateAvailability;
  syncGroupSchedule: (selection: StudentSelection) => Promise<boolean>;
  clearCachedSchedule: () => void;
}

export function useScheduleSource(
  settings: ResolvedUserSettings
): ScheduleSourceState {
  const [cachedSchedule, setCachedSchedule] = useState<NormalizedSchedule | null>(
    readCachedSchedule
  );
  const profile = settings.universityProfile;
  const hasMatchingCache = isCacheMatchingProfile(cachedSchedule, profile);

  const [syncStatus, setSyncStatus] = useState<ScheduleSyncStatus>(() => {
    if (!profile) return 'builtin';
    const adapter = getUniversityAdapter(profile.universityId);
    if (adapter?.meta.supportStatus === 'manual_only') return 'manual';
    return hasMatchingCache ? 'synced' : 'idle';
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) {
      setSyncStatus('builtin');
      setSyncError(null);
      return;
    }
    const adapter = getUniversityAdapter(profile.universityId);
    if (adapter?.meta.supportStatus === 'manual_only') {
      setSyncStatus('manual');
      setSyncError(null);
      return;
    }
    setSyncStatus(hasMatchingCache ? 'synced' : 'idle');
    setSyncError(null);
  }, [
    profile?.universityId,
    profile?.facultyId,
    profile?.groupId,
    hasMatchingCache,
  ]);

  const bundle = useMemo(() => {
    if (!hasMatchingCache || !cachedSchedule) {
      return null;
    }
    return toAppScheduleBundle(cachedSchedule);
  }, [hasMatchingCache, cachedSchedule]);

  const schedule = bundle ? bundle.schedule : profile ? [] : scheduleData;
  const teachers = bundle ? bundle.teachers : profile ? [] : teachersData;
  const classrooms = bundle ? bundle.classrooms : profile ? [] : classroomsData;

  const scheduleMap = useMemo(
    () => (bundle ? createLessonsMap(bundle.schedule) : profile ? new Map() : defaultLessonsMap),
    [bundle, profile]
  );
  const teachersMap = useMemo(
    () => (bundle ? createTeachersMap(bundle.teachers) : profile ? new Map() : defaultTeachersMap),
    [bundle, profile]
  );
  const classroomsMap = useMemo(
    () => (bundle ? createClassroomsMap(bundle.classrooms) : profile ? new Map() : defaultClassroomsMap),
    [bundle, profile]
  );

  const availableElectives = useMemo(() => {
    if (!hasMatchingCache || !cachedSchedule) return [];
    const byKey = new Map<string, string>();
    for (const lesson of cachedSchedule.lessons) {
      if (lesson.isElective && lesson.electiveKey && !byKey.has(lesson.electiveKey)) {
        byKey.set(lesson.electiveKey, lesson.subject);
      }
    }
    return Array.from(byKey.entries())
      .map(([key, subject]) => ({ key, subject }))
      .sort((a, b) => a.subject.localeCompare(b.subject, 'uk'));
  }, [hasMatchingCache, cachedSchedule]);

  const availableTracks = useMemo(() => {
    if (!hasMatchingCache || !cachedSchedule) return [];
    const byNum = new Map<number, string[]>();
    for (const lesson of cachedSchedule.lessons) {
      if (lesson.trackNumber !== undefined) {
        const list = byNum.get(lesson.trackNumber) ?? [];
        if (!list.includes(lesson.subject)) list.push(lesson.subject);
        byNum.set(lesson.trackNumber, list);
      }
    }
    return Array.from(byNum.entries())
      .map(([number, subjects]) => ({ number, subjects }))
      .sort((a, b) => a.number - b.number);
  }, [hasMatchingCache, cachedSchedule]);

  const getLessonsForDate = useCallback(
    (date: Date, parity: WeekParity): Lesson[] => {
      if (bundle) {
        const iso = formatIsoDate(date);
        const dated = bundle.datedLessonsByIso[iso];
        const isDatedSource =
          cachedSchedule?.sourceType === 'dated' ||
          Object.keys(bundle.datedLessonsByIso).length > 0;
        if (dated) {
          return filterLessons(dated, settings, isDatedSource ? undefined : parity);
        }
        // LNU supplies an exact-date calendar. A missing date is never a weekly recurrence.
        if (isDatedSource) {
          return [];
        }
        const dayNum = getScheduleDayNumber(date);
        return filterLessons(getDayLessons(dayNum, bundle.schedule), settings, parity);
      }

      if (profile) return [];
      const dayNum = getScheduleDayNumber(date);
      return filterLessons(getDayLessons(dayNum, scheduleData), settings, parity);
    },
    [bundle, cachedSchedule, profile, settings]
  );

  const getDateAvailability = useCallback((date: Date): ScheduleDateAvailability => {
    if (!profile) return 'loaded';
    if (!bundle || !cachedSchedule) return 'not_loaded';
    const iso = formatIsoDate(date);
    if (cachedSchedule.sourceType === 'dated' || Object.keys(bundle.datedLessonsByIso).length > 0) {
      if (!cachedSchedule.coveredFrom || !cachedSchedule.coveredTo ||
          iso < cachedSchedule.coveredFrom || iso > cachedSchedule.coveredTo) {
        return 'outside_coverage';
      }
      return bundle.datedLessonsByIso[iso]?.length ? 'loaded' : 'free_day';
    }
    return 'loaded';
  }, [profile, bundle, cachedSchedule]);

  const syncGroupSchedule = useCallback(
    async (selection: StudentSelection): Promise<boolean> => {
      const adapter = getUniversityAdapter(selection.universityId);
      if (!adapter) {
        setSyncStatus('error');
        setSyncError(`Невідомий адаптер університету: ${selection.universityId}`);
        return false;
      }

      if (adapter.meta.supportStatus === 'manual_only') {
        setSyncStatus('manual');
        setSyncError(adapter.meta.sourceNote);
        return false;
      }

      setSyncStatus('syncing');
      setSyncError(null);

      try {
        const normalized = await adapter.fetchSchedule(selection);
        if (selection.facultyId && !normalized.facultyId) {
          normalized.facultyId = selection.facultyId;
        }
        if (normalized.lessons.length === 0) {
          setSyncStatus('error');
          setSyncError(
            normalized.warnings[0] ??
              'Розклад для цієї групи на обраний період порожній.'
          );
          return false;
        }
        setCachedSchedule(normalized);
        writeStorage(CACHED_GROUP_SCHEDULE_KEY, { schemaVersion: 2, schedule: normalized });
        setSyncStatus('synced');
        setSyncError(null);
        return true;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Не вдалося завантажити розклад університету.';
        setSyncStatus('error');
        setSyncError(message);
        return false;
      }
    },
    []
  );

  const clearCachedSchedule = useCallback(() => {
    setCachedSchedule(null);
    writeStorage(CACHED_GROUP_SCHEDULE_KEY, null);
    writeStorage(LEGACY_GROUP_SCHEDULE_KEY, null);
    setSyncStatus('builtin');
    setSyncError(null);
  }, []);

  return {
    schedule,
    teachers,
    classrooms,
    scheduleMap,
    teachersMap,
    classroomsMap,
    datedLessonsByIso: bundle ? bundle.datedLessonsByIso : null,
    availableElectives,
    availableTracks,
    hasSubgroups: !profile || Boolean(hasMatchingCache && cachedSchedule?.lessons.some((lesson) => lesson.subgroup !== undefined)),
    isUsingCustomGroup: Boolean(bundle),
    syncStatus,
    lastSyncedAt: hasMatchingCache ? (cachedSchedule?.fetchedAt ?? null) : null,
    syncError,
    syncWarnings: hasMatchingCache ? (cachedSchedule?.warnings ?? []) : [],
    getLessonsForDate,
    getDateAvailability,
    syncGroupSchedule,
    clearCachedSchedule,
  };
}
