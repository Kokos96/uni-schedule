import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredDeviceAuth, readProfileFromBackend, syncProfileToBackend } from '../services/apiClient';
import { ProfileSyncQueue, profileSignature, type ProfileSyncStatus } from '../services/profileSyncQueue';
import {
  DepartmentType,
  DesktopScheduleMode,
  ElectiveType,
  ResolvedUserSettings,
  ThemeMode,
  UserSettings,
} from '../types';
import { DEFAULT_SEMESTER_START_DATE, isValidIsoDate } from '../utils/date';
import { normalizeSelectedParallelGroups } from '../utils/parallelGroups';
import { readStorage, StorageErrorCode, writeStorage } from '../utils/storage';
import type { StudentSelection } from '../integrations/universities/types';

const SETTINGS_KEY = 'uni_schedule_settings_v2';

export const DEFAULT_SETTINGS: ResolvedUserSettings = {
  subgroup: 1,
  department: 'sp',
  electiveCourse: 'freelance',
  theme: 'dark',
  attendanceGoal: 80,
  showWeekends: false,
  semesterStartDate: DEFAULT_SEMESTER_START_DATE,
  desktopScheduleMode: 'week',
  scheduleSourceMode: 'unconfigured',
};

const VALID_DEPARTMENTS = new Set<DepartmentType>(['sp', 'oit', 'rks', 'rkt']);
const VALID_ELECTIVES = new Set<ElectiveType>(['freelance', 'management', 'space', 'both']);
const VALID_THEMES = new Set<ThemeMode>(['dark', 'light', 'system']);
const VALID_DESKTOP_MODES = new Set<DesktopScheduleMode>(['day', 'week']);

/** Normalize and apply v2.0 defaults onto legacy or partial UserSettings objects. */
export function normalizeSettings(raw: unknown): ResolvedUserSettings {
  if (typeof raw !== 'object' || raw === null) {
    return { ...DEFAULT_SETTINGS };
  }

  const candidate = raw as Partial<UserSettings>;

  const subgroup: 1 | 2 = candidate.subgroup === 2 ? 2 : 1;
  const department: DepartmentType =
    typeof candidate.department === 'string' &&
    VALID_DEPARTMENTS.has(candidate.department as DepartmentType)
      ? (candidate.department as DepartmentType)
      : DEFAULT_SETTINGS.department;

  const electiveCourse: ElectiveType =
    typeof candidate.electiveCourse === 'string' &&
    VALID_ELECTIVES.has(candidate.electiveCourse as ElectiveType)
      ? (candidate.electiveCourse as ElectiveType)
      : DEFAULT_SETTINGS.electiveCourse;

  const theme: ThemeMode =
    typeof candidate.theme === 'string' && VALID_THEMES.has(candidate.theme as ThemeMode)
      ? (candidate.theme as ThemeMode)
      : DEFAULT_SETTINGS.theme;

  const rawGoal = candidate.attendanceGoal;
  const attendanceGoal =
    typeof rawGoal === 'number' && Number.isFinite(rawGoal)
      ? Math.min(100, Math.max(50, Math.round(rawGoal)))
      : DEFAULT_SETTINGS.attendanceGoal;

  const showWeekends =
    typeof candidate.showWeekends === 'boolean'
      ? candidate.showWeekends
      : DEFAULT_SETTINGS.showWeekends;

  const semesterStartDate =
    typeof candidate.semesterStartDate === 'string' &&
    isValidIsoDate(candidate.semesterStartDate)
      ? candidate.semesterStartDate
      : DEFAULT_SETTINGS.semesterStartDate;

  const desktopScheduleMode: DesktopScheduleMode =
    typeof candidate.desktopScheduleMode === 'string' &&
    VALID_DESKTOP_MODES.has(candidate.desktopScheduleMode as DesktopScheduleMode)
      ? (candidate.desktopScheduleMode as DesktopScheduleMode)
      : DEFAULT_SETTINGS.desktopScheduleMode;

  let universityProfile: StudentSelection | undefined;
  const rawUni = candidate.universityProfile;
  if (
    rawUni &&
    typeof rawUni === 'object' &&
    typeof rawUni.universityId === 'string' &&
    rawUni.universityId.trim().length > 0 &&
    typeof rawUni.groupId === 'string' &&
    typeof rawUni.groupName === 'string'
  ) {
    universityProfile = {
      universityId: rawUni.universityId.trim(),
      groupId: rawUni.groupId.trim(),
      groupName: rawUni.groupName.trim(),
      ...(typeof rawUni.facultyId === 'string' ? { facultyId: rawUni.facultyId } : {}),
      ...(typeof rawUni.facultyName === 'string' ? { facultyName: rawUni.facultyName } : {}),
      ...(typeof rawUni.programId === 'string' && rawUni.programId.trim()
        ? { programId: rawUni.programId.trim() }
        : {}),
      ...(typeof rawUni.programName === 'string' && rawUni.programName.trim()
        ? { programName: rawUni.programName.trim() }
        : {}),
      ...(typeof rawUni.course === 'number' && Number.isFinite(rawUni.course)
        ? { course: rawUni.course }
        : {}),
      ...(rawUni.subgroup === 1 || rawUni.subgroup === 2
        ? { subgroup: rawUni.subgroup }
        : {}),
    };
  }

  const scheduleSourceMode =
    candidate.scheduleSourceMode === 'builtin' ||
    candidate.scheduleSourceMode === 'live' ||
    candidate.scheduleSourceMode === 'manual' ||
    candidate.scheduleSourceMode === 'unconfigured'
      ? candidate.scheduleSourceMode
      : universityProfile
        ? 'live'
        : 'unconfigured';
  const resolvedSourceMode =
    scheduleSourceMode === 'live' && !universityProfile ? 'unconfigured' : scheduleSourceMode;
  if (resolvedSourceMode === 'builtin') universityProfile = undefined;

  const selectedElectives = Array.isArray(candidate.selectedElectives)
    ? Array.from(
        new Set(
          candidate.selectedElectives.filter(
            (item): item is string => typeof item === 'string' && item.trim().length > 0
          )
        )
      )
    : undefined;

  const selectedTrack =
    typeof candidate.selectedTrack === 'number' &&
    Number.isInteger(candidate.selectedTrack) &&
    candidate.selectedTrack >= 1 &&
    candidate.selectedTrack <= 20
      ? candidate.selectedTrack
      : undefined;

  const selectedParallelGroups = normalizeSelectedParallelGroups(candidate.selectedParallelGroups);

  return {
    subgroup,
    department,
    electiveCourse,
    theme,
    attendanceGoal,
    showWeekends,
    semesterStartDate,
    desktopScheduleMode,
    scheduleSourceMode: resolvedSourceMode,
    ...(universityProfile ? { universityProfile: { ...universityProfile, subgroup } } : {}),
    ...(selectedElectives !== undefined ? { selectedElectives } : {}),
    ...(selectedTrack !== undefined ? { selectedTrack } : {}),
    ...(selectedParallelGroups ? { selectedParallelGroups } : {}),
  };
}

export interface UseSettingsResult {
  settings: ResolvedUserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  resetSettings: () => void;
  storageError: StorageErrorCode | null;
  profileSyncStatus: ProfileSyncStatus;
  profileSyncError: string | null;
  confirmProfileOverwrite: () => void;
  isHydratingRemoteProfile: boolean;
}

export const useSettings = (): UseSettingsResult => {
  const [settings, setSettings] = useState<ResolvedUserSettings>(() => {
    const saved = readStorage<unknown>(SETTINGS_KEY, null);
    return normalizeSettings(saved);
  });
  const [isHydratingRemoteProfile, setIsHydratingRemoteProfile] = useState<boolean>(() => {
    const saved = normalizeSettings(readStorage<unknown>(SETTINGS_KEY, null));
    return saved.scheduleSourceMode === 'unconfigured' && Boolean(getStoredDeviceAuth()?.syncToken);
  });
  const [storageError, setStorageError] = useState<StorageErrorCode | null>(null);
  const settingsRef = useRef(settings);
  const [profileSyncStatus, setProfileSyncStatus] = useState<ProfileSyncStatus>('idle');
  const [profileSyncError, setProfileSyncError] = useState<string | null>(null);
  const queueRef = useRef<ProfileSyncQueue | null>(null);
  if (!queueRef.current) {
    queueRef.current = new ProfileSyncQueue(syncProfileToBackend, (status, error) => {
      setProfileSyncStatus(status);
      setProfileSyncError(error);
    });
  }

  useEffect(() => {
    const result = writeStorage(SETTINGS_KEY, settings);
    setStorageError(result.ok ? null : (result.error ?? 'unknown'));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    const queue = queueRef.current!;
    if (queue.pendingSettings && settingsRef.current.scheduleSourceMode === 'unconfigured') {
      const restored = normalizeSettings(queue.pendingSettings);
      settingsRef.current = restored;
      setSettings(restored);
    } else if (queue.pendingSettings &&
      profileSignature(queue.pendingSettings) !== profileSignature(settingsRef.current)) {
      queue.enqueue(settingsRef.current);
    }
    queue.start();
    const retry = () => queue.retry();
    if (typeof window !== 'undefined') window.addEventListener('online', retry);
    const requestedForSignature = profileSignature(settingsRef.current);
    void readProfileFromBackend()
      .then((result) => {
        if (cancelled) return;
        if (profileSignature(settingsRef.current) !== requestedForSignature) return;
        if (result.status !== 'ok') {
          if (settingsRef.current.scheduleSourceMode !== 'unconfigured' && !queue.hasPending) {
            queue.enqueue(settingsRef.current);
          }
          return;
        }
        const remote = result.profile;
        // Revision zero denotes legacy rows whose explicit user intent cannot be proven.
        // Never restore those rows into an unconfigured client.
        if (settingsRef.current.scheduleSourceMode === 'unconfigured' && remote.revision === 0) return;
        queue.setRevision(remote.revision);
        if (queue.hasPending) return;
        if (settingsRef.current.scheduleSourceMode !== 'unconfigured') {
          const local = settingsRef.current;
          if (remote.revision === 0) {
            // A migrated row does not prove an explicit selection; acknowledge it now.
            queue.enqueue(local);
            return;
          }
          const remoteComparable = normalizeSettings({
            ...local,
            scheduleSourceMode: remote.sourceMode,
            universityProfile: remote.sourceMode === 'live' || remote.sourceMode === 'manual'
              ? {
                  universityId: remote.universityId,
                  facultyId: remote.facultyId,
                  facultyName: remote.facultyName,
                  course: remote.course,
                  groupId: remote.groupId,
                  groupName: remote.groupName,
                  subgroup: remote.subgroup,
                }
              : undefined,
            subgroup: remote.subgroup,
            department: remote.department,
            electiveCourse: remote.electiveCourse,
            selectedElectives: remote.selectedElectives,
            selectedTrack: remote.selectedTrack,
            selectedParallelGroups: remote.selectedParallelGroups,
          });
          if (profileSignature(local) !== profileSignature(remoteComparable)) queue.enqueue(local);
          return;
        }
        if (remote.sourceMode === 'unconfigured') return;
        const restored = normalizeSettings({
          ...settingsRef.current,
          scheduleSourceMode: remote.sourceMode,
          universityProfile: remote.sourceMode === 'live' || remote.sourceMode === 'manual'
            ? {
                universityId: remote.universityId,
                facultyId: remote.facultyId,
                facultyName: remote.facultyName,
                course: remote.course,
                groupId: remote.groupId,
                groupName: remote.groupName,
                subgroup: remote.subgroup,
              }
            : undefined,
          subgroup: remote.subgroup,
          department: remote.department,
          electiveCourse: remote.electiveCourse,
          selectedElectives: remote.selectedElectives,
          selectedTrack: remote.selectedTrack,
          selectedParallelGroups: remote.selectedParallelGroups,
        });
        settingsRef.current = restored;
        setSettings(restored);
      })
      .catch(() => {
        if (!cancelled && settingsRef.current.scheduleSourceMode !== 'unconfigured' && !queue.hasPending) {
          queue.enqueue(settingsRef.current);
        }
      })
      .finally(() => {
        if (!cancelled) setIsHydratingRemoteProfile(false);
      });
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') window.removeEventListener('online', retry);
      queue.dispose();
    };
  }, []);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    const prev = settingsRef.current;
    const next = normalizeSettings({
      ...prev,
      ...newSettings,
      ...(!newSettings.scheduleSourceMode && newSettings.universityProfile
        ? { scheduleSourceMode: 'live' as const }
        : {}),
    });
    settingsRef.current = next;
    const saved = writeStorage(SETTINGS_KEY, next);
    setStorageError(saved.ok ? null : (saved.error ?? 'unknown'));
    setSettings(next);
    if (profileSignature(prev) !== profileSignature(next)) queueRef.current?.enqueue(next);
  }, []);

  const resetSettings = useCallback(() => {
    const next: ResolvedUserSettings = { ...DEFAULT_SETTINGS, scheduleSourceMode: 'builtin' };
    settingsRef.current = next;
    const saved = writeStorage(SETTINGS_KEY, next);
    setStorageError(saved.ok ? null : (saved.error ?? 'unknown'));
    setSettings(next);
    queueRef.current?.enqueue(next);
  }, []);

  const confirmProfileOverwrite = useCallback(() => {
    queueRef.current?.confirmLocalIntent();
  }, []);

  return {
    settings,
    updateSettings,
    resetSettings,
    storageError,
    profileSyncStatus,
    profileSyncError,
    confirmProfileOverwrite,
    isHydratingRemoteProfile,
  };
};
