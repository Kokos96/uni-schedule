import { useState, useEffect } from 'react';
import { UserSettings } from '../types';

const SETTINGS_KEY = 'uni_schedule_settings_v2';

const defaultSettings: UserSettings = {
  subgroup: 1,
  department: 'sp',
  electiveCourse: 'freelance',
};

export const useSettings = () => {
  const [settings, setSettings] = useState<UserSettings>(() => {
    try {
      const saved = localStorage.getItem(SETTINGS_KEY);
      return saved ? { ...defaultSettings, ...JSON.parse(saved) } : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return { settings, updateSettings };
};
