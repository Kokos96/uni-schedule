import { useCallback, useEffect, useState } from 'react';
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

  return {
    subgroup,
    department,
    electiveCourse,
    theme,
    attendanceGoal,
    showWeekends,
    semesterStartDate,
    desktopScheduleMode,
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

  const updateSettings = useCallback((newSettings: Partial<UserSettings>) => {
    setSettings((prev) => normalizeSettings({ ...prev, ...newSettings }));
  }, []);

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_SETTINGS });
  }, []);

  return { settings, updateSettings, resetSettings, storageError };
};
