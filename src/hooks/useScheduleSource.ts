import { useCallback, useMemo, useState } from 'react';
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

const CACHED_GROUP_SCHEDULE_KEY = 'uni_schedule_cached_group_v1';

export type ScheduleSyncStatus = 'builtin' | 'idle' | 'syncing' | 'synced' | 'error' | 'manual';

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
  isUsingCustomGroup: boolean;
  syncStatus: ScheduleSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  syncWarnings: string[];
  getLessonsForDate: (date: Date, parity: WeekParity) => Lesson[];
  syncGroupSchedule: (selection: StudentSelection) => Promise<boolean>;
  clearCachedSchedule: () => void;
}

export function useScheduleSource(
  settings: ResolvedUserSettings
): ScheduleSourceState {
  const [cachedSchedule, setCachedSchedule] = useState<NormalizedSchedule | null>(
    () => readStorage<NormalizedSchedule | null>(CACHED_GROUP_SCHEDULE_KEY, null)
  );
  const [syncStatus, setSyncStatus] = useState<ScheduleSyncStatus>(() => {
    const profile = settings.universityProfile;
    if (!profile) return 'builtin';
    const adapter = getUniversityAdapter(profile.universityId);
    if (adapter?.meta.supportStatus === 'manual_only') return 'manual';
    return cachedSchedule &&
      cachedSchedule.universityId === profile.universityId &&
      cachedSchedule.groupId === profile.groupId &&
      (!profile.facultyId || !cachedSchedule.facultyId || cachedSchedule.facultyId === profile.facultyId)
      ? 'synced'
      : 'idle';
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const profile = settings.universityProfile;
  const hasMatchingCache = Boolean(
    profile &&
      cachedSchedule &&
      cachedSchedule.universityId === profile.universityId &&
      cachedSchedule.groupId === profile.groupId &&
      (!profile.facultyId || !cachedSchedule.facultyId || cachedSchedule.facultyId === profile.facultyId) &&
      cachedSchedule.lessons.length > 0
  );

  const bundle = useMemo(() => {
    if (!hasMatchingCache || !cachedSchedule) {
      return null;
    }
    return toAppScheduleBundle(cachedSchedule);
  }, [hasMatchingCache, cachedSchedule]);

  const schedule = bundle ? bundle.schedule : scheduleData;
  const teachers = bundle ? bundle.teachers : teachersData;
  const classrooms = bundle ? bundle.classrooms : classroomsData;

  const scheduleMap = useMemo(
    () => (bundle ? createLessonsMap(bundle.schedule) : defaultLessonsMap),
    [bundle]
  );
  const teachersMap = useMemo(
    () => (bundle ? createTeachersMap(bundle.teachers) : defaultTeachersMap),
    [bundle]
  );
  const classroomsMap = useMemo(
    () => (bundle ? createClassroomsMap(bundle.classrooms) : defaultClassroomsMap),
    [bundle]
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
        if (dated) {
          return filterLessons(dated, settings, parity);
        }
        const dayNum = getScheduleDayNumber(date);
        return filterLessons(getDayLessons(dayNum, bundle.schedule), settings, parity);
      }

      const dayNum = getScheduleDayNumber(date);
      return filterLessons(getDayLessons(dayNum, scheduleData), settings, parity);
    },
    [bundle, settings]
  );

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
        writeStorage(CACHED_GROUP_SCHEDULE_KEY, normalized);
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
    isUsingCustomGroup: Boolean(bundle),
    syncStatus,
    lastSyncedAt: hasMatchingCache ? (cachedSchedule?.fetchedAt ?? null) : null,
    syncError,
    syncWarnings: hasMatchingCache ? (cachedSchedule?.warnings ?? []) : [],
    getLessonsForDate,
    syncGroupSchedule,
    clearCachedSchedule,
  };
}
