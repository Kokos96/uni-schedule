import { hasDepartmentSupportForGroup } from '../data/academicProgramRegistry';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  clearCachedSchedules,
  readCachedSchedule,
  scheduleIdentity,
  shouldRefreshSchedule,
  writeCachedSchedule,
} from './scheduleCache';

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
  hasDepartments: boolean;
  isUsingCustomGroup: boolean;
  syncStatus: ScheduleSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  syncWarnings: string[];
  getLessonsForDate: (date: Date, parity: WeekParity) => Lesson[];
  getDateAvailability: (date: Date) => ScheduleDateAvailability;
  syncGroupSchedule: (selection: StudentSelection, options?: { force?: boolean }) => Promise<boolean>;
  clearCachedSchedule: () => void;
}

export function useScheduleSource(
  settings: ResolvedUserSettings
): ScheduleSourceState {
  const mode = settings.scheduleSourceMode;
  const isBuiltin = mode === 'builtin';
  const profile = mode === 'live' ? settings.universityProfile : undefined;
  const [cachedSchedule, setCachedSchedule] = useState<NormalizedSchedule | null>(
    () => readCachedSchedule(profile)
  );
  const hasMatchingCache = isCacheMatchingProfile(cachedSchedule, profile);
  const sourceKey = `${mode}:${profile ? scheduleIdentity(profile) : ''}`;
  const activeSourceRef = useRef(sourceKey);
  const requestSeqRef = useRef(0);
  const inFlightRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  if (activeSourceRef.current !== sourceKey) {
    activeSourceRef.current = sourceKey;
    requestSeqRef.current += 1;
    inFlightRef.current = null;
  }

  const [syncStatus, setSyncStatus] = useState<ScheduleSyncStatus>(() => {
    if (isBuiltin) return 'builtin';
    if (mode === 'manual') return 'manual';
    return hasMatchingCache ? 'synced' : 'idle';
  });
  const [syncError, setSyncError] = useState<string | null>(null);

  const bundle = useMemo(() => {
    if (!hasMatchingCache || !cachedSchedule) {
      return null;
    }
    return toAppScheduleBundle(cachedSchedule);
  }, [hasMatchingCache, cachedSchedule]);

  const schedule = bundle ? bundle.schedule : isBuiltin ? scheduleData : [];
  const teachers = bundle ? bundle.teachers : isBuiltin ? teachersData : [];
  const classrooms = bundle ? bundle.classrooms : isBuiltin ? classroomsData : [];

  const scheduleMap = useMemo(
    () => (bundle ? createLessonsMap(bundle.schedule) : isBuiltin ? defaultLessonsMap : new Map()),
    [bundle, isBuiltin]
  );
  const teachersMap = useMemo(
    () => (bundle ? createTeachersMap(bundle.teachers) : isBuiltin ? defaultTeachersMap : new Map()),
    [bundle, isBuiltin]
  );
  const classroomsMap = useMemo(
    () => (bundle ? createClassroomsMap(bundle.classrooms) : isBuiltin ? defaultClassroomsMap : new Map()),
    [bundle, isBuiltin]
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

      if (!isBuiltin) return [];
      const dayNum = getScheduleDayNumber(date);
      return filterLessons(getDayLessons(dayNum, scheduleData), settings, parity);
    },
    [bundle, cachedSchedule, isBuiltin, settings]
  );

  const getDateAvailability = useCallback((date: Date): ScheduleDateAvailability => {
    if (isBuiltin) return 'loaded';
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
  }, [isBuiltin, bundle, cachedSchedule]);

  const syncGroupSchedule = useCallback(
    async (selection: StudentSelection, options?: { force?: boolean }): Promise<boolean> => {
      const key = `live:${scheduleIdentity(selection)}`;
      const existing = inFlightRef.current;
      if (!options?.force && existing?.key === key) return existing.promise;
      activeSourceRef.current = key;
      const requestSeq = ++requestSeqRef.current;
      const isCurrent = () => activeSourceRef.current === key && requestSeqRef.current === requestSeq;
      const adapter = getUniversityAdapter(selection.universityId);
      if (!adapter) {
        if (isCurrent()) {
          setSyncStatus('error');
          setSyncError(`Невідомий адаптер університету: ${selection.universityId}`);
        }
        return false;
      }

      if (adapter.meta.supportStatus === 'manual_only') {
        if (isCurrent()) {
          setSyncStatus('manual');
          setSyncError(adapter.meta.sourceNote);
        }
        return false;
      }

      setSyncStatus('syncing');
      setSyncError(null);

      const promise = (async () => {
        try {
          const received = await adapter.fetchSchedule(selection, options);
          if (!isCurrent()) return false;
          const normalized: NormalizedSchedule = {
            ...received,
            ...(selection.facultyId && !received.facultyId ? { facultyId: selection.facultyId } : {}),
          };
          if (scheduleIdentity(normalized) !== scheduleIdentity(selection) ||
              normalized.lessons.length === 0) {
            setSyncStatus('error');
            setSyncError(normalized.warnings[0] ?? 'Сервер повернув порожній або чужий розклад.');
            return false;
          }
          setCachedSchedule(normalized);
          const persisted = writeCachedSchedule(normalized);
          setSyncStatus('synced');
          setSyncError(
            persisted
              ? null
              : 'Розклад завантажено, але локальне сховище переповнене — офлайн-кеш може не зберегтися.'
          );
          return true;
        } catch (err) {
          if (!isCurrent()) return false;
          const message = err instanceof Error
            ? err.message : 'Не вдалося завантажити розклад університету.';
          setSyncStatus('error');
          setSyncError(message);
          return false;
        }
      })();
      inFlightRef.current = { key, promise };
      void promise.then(() => {
        if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
      });
      return promise;
    },
    []
  );

  useEffect(() => {
    if (mode === 'builtin') {
      setCachedSchedule(null);
      setSyncStatus('builtin');
      setSyncError(null);
      return;
    }
    if (mode !== 'live' || !profile) {
      setCachedSchedule(null);
      setSyncStatus(mode === 'manual' ? 'manual' : 'idle');
      setSyncError(null);
      return;
    }
    const restored = readCachedSchedule(profile);
    setCachedSchedule(restored);
    if (inFlightRef.current?.key !== sourceKey) setSyncStatus(restored ? 'synced' : 'idle');
    setSyncError(null);
    const adapter = getUniversityAdapter(profile.universityId);
    if (adapter?.meta.supportStatus !== 'live') return;
    const refreshIfNeeded = () => {
      if (activeSourceRef.current !== sourceKey) return;
      if (shouldRefreshSchedule(readCachedSchedule(profile), formatIsoDate(new Date()))) {
        void syncGroupSchedule(profile);
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('online', refreshIfNeeded);
    if (typeof navigator === 'undefined' || navigator.onLine) refreshIfNeeded();
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('online', refreshIfNeeded);
    };
  }, [sourceKey, syncGroupSchedule]);

  const clearCachedSchedule = useCallback(() => {
    activeSourceRef.current = 'builtin:';
    requestSeqRef.current += 1;
    inFlightRef.current = null;
    setCachedSchedule(null);
    clearCachedSchedules();
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
    hasSubgroups: isBuiltin || Boolean(hasMatchingCache && cachedSchedule?.lessons.some((lesson) => lesson.subgroup !== undefined)),
    isUsingCustomGroup: Boolean(bundle),
    syncStatus,
    lastSyncedAt: hasMatchingCache ? (cachedSchedule?.fetchedAt ?? null) : null,
    syncError,
    syncWarnings: hasMatchingCache ? (cachedSchedule?.warnings ?? []) : [],
    getLessonsForDate,
    getDateAvailability,
    syncGroupSchedule,
    hasDepartments: isBuiltin || hasDepartmentSupportForGroup(profile?.universityId, profile?.groupId),
    clearCachedSchedule,
  };
}
