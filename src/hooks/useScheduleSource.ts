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
  detectParallelGroupDimensions,
  resolveActiveParallelSelections,
  type ParallelGroupDimension,
  type ParallelSelectionMap,
} from '../utils/parallelGroups';
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
  isConfirmedEmptySchedule,
  isScheduleCompatibleWithProfile,
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
    isScheduleCompatibleWithProfile(cachedSchedule, profile) &&
    (cachedSchedule.lessons.length > 0 || isConfirmedEmptySchedule(cachedSchedule))
  );
}

export type ScheduleSyncStatus = 'builtin' | 'idle' | 'syncing' | 'synced' | 'error' | 'manual';
export type ScheduleDateAvailability = 'loaded' | 'free_day' | 'outside_coverage' | 'not_loaded';

export interface ScheduleActivationResult {
  ok: boolean;
  schedule?: NormalizedSchedule;
  error?: string;
  cancelled?: boolean;
}

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
  availableParallelGroups: ParallelGroupDimension[];
  unconfiguredParallelGroups: ParallelGroupDimension[];
  staleParallelGroups: ParallelGroupDimension[];
  partialParallelGroups: ParallelGroupDimension[];
  effectiveParallelSelections: ParallelSelectionMap | undefined;
  hasSubgroups: boolean;
  hasDepartments: boolean;
  isUsingCustomGroup: boolean;
  syncStatus: ScheduleSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  syncWarnings: string[];
  getLessonsForDate: (date: Date, parity: WeekParity) => Lesson[];
  getUnfilteredParallelLessonsForDate: (date: Date, parity: WeekParity) => Lesson[];
  getDateAvailability: (date: Date) => ScheduleDateAvailability;
  activateGroupSchedule: (
    selection: StudentSelection,
    options?: { force?: boolean; background?: boolean }
  ) => Promise<ScheduleActivationResult>;
  syncGroupSchedule: (
    selection: StudentSelection,
    options?: { force?: boolean; background?: boolean }
  ) => Promise<boolean>;
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
  const committedSourceKey = `${mode}:${profile ? scheduleIdentity(profile) : ''}`;

  // Request generation counter incremented ONLY by explicit user transitions,
  // cancellation, or mode teardown — never by ordinary React renders.
  const requestGenRef = useRef(0);
  const activeActivationRef = useRef<{
    key: string;
    gen: number;
    promise: Promise<ScheduleActivationResult>;
  } | null>(null);
  const backgroundRefreshRef = useRef<{
    key: string;
    gen: number;
    promise: Promise<ScheduleActivationResult>;
  } | null>(null);
  const committedKeyRef = useRef(committedSourceKey);
  const unmountedRef = useRef(false);

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

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

  const availableParallelGroups = useMemo(() => {
    if (!hasMatchingCache || !cachedSchedule) return [];
    return detectParallelGroupDimensions(cachedSchedule.lessons, {
      universityId: cachedSchedule.universityId,
      groupId: cachedSchedule.groupId,
    });
  }, [hasMatchingCache, cachedSchedule]);

  const parallelState = useMemo(
    () =>
      resolveActiveParallelSelections(
        availableParallelGroups,
        settings.selectedParallelGroups
      ),
    [availableParallelGroups, settings.selectedParallelGroups]
  );

  const effectiveFilterSettings = useMemo(
    () => ({
      ...settings,
      selectedParallelGroups: parallelState.effectiveSelections,
    }),
    [settings, parallelState.effectiveSelections]
  );

  const getLessonsForDate = useCallback(
    (date: Date, parity: WeekParity): Lesson[] => {
      if (bundle) {
        const iso = formatIsoDate(date);
        const dated = bundle.datedLessonsByIso[iso];
        const isDatedSource =
          cachedSchedule?.sourceType === 'dated' ||
          Object.keys(bundle.datedLessonsByIso).length > 0;
        if (dated) {
          return filterLessons(dated, effectiveFilterSettings, isDatedSource ? undefined : parity);
        }
        // LNU supplies an exact-date calendar. A missing date is never a weekly recurrence.
        if (isDatedSource) {
          return [];
        }
        const dayNum = getScheduleDayNumber(date);
        return filterLessons(getDayLessons(dayNum, bundle.schedule), effectiveFilterSettings, parity);
      }

      if (!isBuiltin) return [];
      const dayNum = getScheduleDayNumber(date);
      return filterLessons(getDayLessons(dayNum, scheduleData), effectiveFilterSettings, parity);
    },
    [bundle, cachedSchedule, isBuiltin, effectiveFilterSettings]
  );

  const getUnfilteredParallelLessonsForDate = useCallback(
    (date: Date, parity: WeekParity): Lesson[] => {
      const withoutParallel = { ...settings, selectedParallelGroups: undefined };
      if (bundle) {
        const iso = formatIsoDate(date);
        const dated = bundle.datedLessonsByIso[iso];
        const isDatedSource =
          cachedSchedule?.sourceType === 'dated' ||
          Object.keys(bundle.datedLessonsByIso).length > 0;
        if (dated) {
          return filterLessons(dated, withoutParallel, isDatedSource ? undefined : parity);
        }
        if (isDatedSource) {
          return [];
        }
        const dayNum = getScheduleDayNumber(date);
        return filterLessons(getDayLessons(dayNum, bundle.schedule), withoutParallel, parity);
      }
      if (!isBuiltin) return [];
      const dayNum = getScheduleDayNumber(date);
      return filterLessons(getDayLessons(dayNum, scheduleData), withoutParallel, parity);
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

  const activateGroupSchedule = useCallback(
    async (
      selection: StudentSelection,
      options?: { force?: boolean; background?: boolean }
    ): Promise<ScheduleActivationResult> => {
      const isBackground = Boolean(options?.background);
      const key = `live:${scheduleIdentity(selection)}`;

      // Never allow an automatic background refresh to override an active user-initiated activation.
      if (isBackground && activeActivationRef.current) {
        return { ok: false, cancelled: true };
      }

      const existingFlight = isBackground ? backgroundRefreshRef.current : activeActivationRef.current;
      if (!options?.force && existingFlight?.key === key) {
        return existingFlight.promise;
      }

      const gen = ++requestGenRef.current;
      const isCurrent = () => !unmountedRef.current && requestGenRef.current === gen;

      const adapter = getUniversityAdapter(selection.universityId);
      if (!adapter) {
        const error = `Невідомий адаптер університету: ${selection.universityId}`;
        if (isCurrent() && !isBackground) {
          setSyncStatus('error');
          setSyncError(error);
        }
        return { ok: false, error };
      }

      if (adapter.meta.supportStatus === 'manual_only') {
        const error = adapter.meta.sourceNote;
        if (isCurrent() && !isBackground) {
          setSyncStatus('manual');
          setSyncError(error);
        }
        return { ok: false, error };
      }

      // Fast path for non-forced user activation if a fresh valid local cache already exists
      // and the client is offline.
      if (!options?.force && typeof navigator !== 'undefined' && !navigator.onLine) {
        const localHit = readCachedSchedule(selection);
        if (localHit && isScheduleCompatibleWithProfile(localHit, selection)) {
          if (isCurrent()) {
            setCachedSchedule(localHit);
            setSyncStatus('synced');
            setSyncError(null);
          }
          return { ok: true, schedule: localHit };
        }
      }

      if (!isBackground) {
        setSyncStatus('syncing');
        setSyncError(null);
      }

      const promise: Promise<ScheduleActivationResult> = (async () => {
        try {
          const received = await adapter.fetchSchedule(selection, options);
          if (!isCurrent()) {
            return { ok: false, cancelled: true };
          }
          // Never blindly attach selection.facultyId to a response missing verified faculty metadata.
          if (!isScheduleCompatibleWithProfile(received, selection)) {
            const error =
              received.warnings[0] ??
              'Сервер повернув розклад іншої групи або несумісного факультету.';
            if (!isBackground) {
              setSyncStatus('error');
              setSyncError(error);
            }
            return { ok: false, error };
          }
          const isValidData =
            received.lessons.length > 0 || isConfirmedEmptySchedule(received);
          if (!isValidData) {
            const error =
              received.warnings[0] ??
              'Сервер повернув порожній або некоректний розклад без підтвердженого періоду.';
            if (!isBackground) {
              setSyncStatus('error');
              setSyncError(error);
            }
            return { ok: false, error };
          }

          const persisted = writeCachedSchedule(received);
          setCachedSchedule(received);
          setSyncStatus('synced');
          setSyncError(
            persisted
              ? null
              : 'Розклад завантажено, але локальне сховище переповнене — офлайн-кеш може не зберегтися.'
          );
          return { ok: true, schedule: received };
        } catch (err) {
          if (!isCurrent()) {
            return { ok: false, cancelled: true };
          }
          const message =
            err instanceof Error
              ? err.message
              : 'Не вдалося завантажити розклад університету.';
          if (!isBackground) {
            setSyncStatus('error');
            setSyncError(message);
          }
          return { ok: false, error: message };
        }
      })();

      if (isBackground) {
        backgroundRefreshRef.current = { key, gen, promise };
        void promise.then(() => {
          if (backgroundRefreshRef.current?.promise === promise) {
            backgroundRefreshRef.current = null;
          }
        });
      } else {
        activeActivationRef.current = { key, gen, promise };
        void promise.then(() => {
          if (activeActivationRef.current?.promise === promise) {
            activeActivationRef.current = null;
          }
        });
      }

      return promise;
    },
    []
  );

  const syncGroupSchedule = useCallback(
    async (
      selection: StudentSelection,
      options?: { force?: boolean; background?: boolean }
    ): Promise<boolean> => {
      const result = await activateGroupSchedule(selection, options);
      return result.ok;
    },
    [activateGroupSchedule]
  );

  useEffect(() => {
    committedKeyRef.current = committedSourceKey;
    if (mode === 'builtin') {
      requestGenRef.current += 1;
      activeActivationRef.current = null;
      backgroundRefreshRef.current = null;
      setCachedSchedule(null);
      setSyncStatus('builtin');
      setSyncError(null);
      return;
    }
    if (mode !== 'live' || !profile) {
      if (mode === 'manual') {
        requestGenRef.current += 1;
        activeActivationRef.current = null;
      }
      backgroundRefreshRef.current = null;
      setCachedSchedule(null);
      setSyncStatus(mode === 'manual' ? 'manual' : 'idle');
      setSyncError(null);
      return;
    }
    const restored = readCachedSchedule(profile);
    setCachedSchedule(restored);
    if (!activeActivationRef.current) {
      setSyncStatus(restored ? 'synced' : 'idle');
      setSyncError(null);
    }
    const adapter = getUniversityAdapter(profile.universityId);
    if (adapter?.meta.supportStatus !== 'live') return;
    const refreshIfNeeded = () => {
      if (committedKeyRef.current !== committedSourceKey) return;
      if (activeActivationRef.current) return;
      if (shouldRefreshSchedule(readCachedSchedule(profile), formatIsoDate(new Date()))) {
        void activateGroupSchedule(profile, { background: true });
      }
    };
    if (typeof window !== 'undefined') window.addEventListener('online', refreshIfNeeded);
    if (typeof navigator === 'undefined' || navigator.onLine) refreshIfNeeded();
    return () => {
      if (typeof window !== 'undefined') window.removeEventListener('online', refreshIfNeeded);
    };
  }, [committedSourceKey, mode, activateGroupSchedule]);

  const clearCachedSchedule = useCallback(() => {
    requestGenRef.current += 1;
    activeActivationRef.current = null;
    backgroundRefreshRef.current = null;
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
    availableParallelGroups,
    unconfiguredParallelGroups: parallelState.unconfiguredDimensions,
    staleParallelGroups: parallelState.staleDimensions,
    partialParallelGroups: parallelState.partialDimensions,
    effectiveParallelSelections: parallelState.effectiveSelections,
    hasSubgroups: isBuiltin || Boolean(hasMatchingCache && cachedSchedule?.lessons.some((lesson) => lesson.subgroup !== undefined)),
    isUsingCustomGroup: Boolean(bundle),
    syncStatus,
    lastSyncedAt: hasMatchingCache ? (cachedSchedule?.fetchedAt ?? null) : null,
    syncError,
    syncWarnings: hasMatchingCache ? (cachedSchedule?.warnings ?? []) : [],
    getLessonsForDate,
    getUnfilteredParallelLessonsForDate,
    getDateAvailability,
    activateGroupSchedule,
    syncGroupSchedule,
    hasDepartments: isBuiltin || hasDepartmentSupportForGroup(profile?.universityId, profile?.groupId),
    clearCachedSchedule,
  };
}
