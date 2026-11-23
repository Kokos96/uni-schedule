import { useCallback, useEffect, useState } from 'react';
import { fetchProfileFromBackend, syncProfileToBackend } from '../services/apiClient';
import {
  DepartmentType,
  DesktopScheduleMode,
  ElectiveType,
  ResolvedUserSettings,
  ThemeMode,
  UserSettings,
} from '../types';
import { DEFAULT_SEMESTER_START_DATE, isValidIsoDate } from '../utils/date';
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
      ...(typeof rawUni.course === 'number' && Number.isFinite(rawUni.course)
        ? { course: rawUni.course }
        : {}),
      ...(rawUni.subgroup === 1 || rawUni.subgroup === 2
        ? { subgroup: rawUni.subgroup }
        : {}),
    };
  }

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

  return {
    subgroup,
    department,
    electiveCourse,
    theme,
    attendanceGoal,
    showWeekends,
    semesterStartDate,
    desktopScheduleMode,
    ...(universityProfile ? { universityProfile: { ...universityProfile, subgroup } } : {}),
    ...(selectedElectives !== undefined ? { selectedElectives } : {}),
    ...(selectedTrack !== undefined ? { selectedTrack } : {}),
  };
}

export interface UseSettingsResult {
  settings: ResolvedUserSettings;
  updateSettings: (newSettings: Partial<UserSettings>) => void;
  resetSettings: () => void;
  storageError: StorageErrorCode | null;
}

export const useSettings = (): UseSettingsResult => {
  const [settings, setSettings] = useState<ResolvedUserSettings>(() => {
    const saved = readStorage<unknown>(SETTINGS_KEY, null);
    return normalizeSettings(saved);
  });
  const [storageError, setStorageError] = useState<StorageErrorCode | null>(null);

  useEffect(() => {
    const result = writeStorage(SETTINGS_KEY, settings);
    setStorageError(result.ok ? null : (result.error ?? 'unknown'));
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    void fetchProfileFromBackend()
      .then((remote) => {
        if (cancelled || !remote) return;
        const isDefaultUnedited =
          remote.universityId === 'lnu' &&
          (remote.facultyId ?? '') === '1005' &&
          remote.groupId === 'ФЕП-33с' &&
          !remote.department &&
          (!remote.selectedElectives || remote.selectedElectives.length === 0) &&
          remote.selectedTrack === undefined;
        const hasCachedLive =
          typeof window !== 'undefined' &&
          window.localStorage.getItem('uni_schedule_cached_group_v2') !== null;
        if (isDefaultUnedited && !hasCachedLive) return;
        setSettings((prev) => {
          if (prev.universityProfile) return prev;
          return normalizeSettings({
            ...prev,
            subgroup: remote.subgroup,
            ...(remote.department ? { department: remote.department as UserSettings['department'] } : {}),
            electiveCourse: remote.electiveCourse as UserSettings['electiveCourse'],
            ...(remote.selectedElectives ? { selectedElectives: remote.selectedElectives } : {}),
            ...(remote.selectedTrack !== undefined ? { selectedTrack: remote.selectedTrack } : {}),
            universityProfile: {
              universityId: remote.universityId,
              facultyId: remote.facultyId,
              facultyName: remote.facultyName,
              course: remote.course,
              groupId: remote.groupId,
              groupName: remote.groupName,
              subgroup: remote.subgroup,
            },
          });
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = normalizeSettings({ ...prev, ...newSettings });
      void syncProfileToBackend(next).catch(() => {});
      return next;
    });
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, updateSettings, resetSettings, storageError };
};
