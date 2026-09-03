import { useState, useEffect } from 'react';
import { UserSettings } from '../types';

const SETTINGS_KEY = 'uni_schedule_settings_v1';

const defaultSettings: UserSettings = {
  subgroup: 1,
  electiveCourse: 'freelance',
};

export const useSettings = () => {
  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem(SETTINGS_KEY);
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  const updateSettings = (newSettings: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  return { settings, updateSettings };
};