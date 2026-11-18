import React, { useId } from 'react';
import {
  CalendarBlank,
  Monitor,
  Moon,
  Palette,
  Sun,
  Target,
} from '@phosphor-icons/react';
import type { ResolvedUserSettings, ThemeMode, UserSettings, WeekParity } from '../../types';
import { DEFAULT_SEMESTER_START_DATE, isValidIsoDate } from '../../utils/date';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';

const THEME_OPTIONS: Array<SegmentedOption<ThemeMode>> = [
  { value: 'dark', label: 'Темна', icon: <Moon weight="duotone" className="h-3.5 w-3.5" /> },
  { value: 'light', label: 'Світла', icon: <Sun weight="duotone" className="h-3.5 w-3.5" /> },
  { value: 'system', label: 'Системна', icon: <Monitor weight="duotone" className="h-3.5 w-3.5" /> },
];

export interface AppearanceSettingsSectionProps {
  resolved: ResolvedUserSettings;
  currentParity: WeekParity;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
}

export const AppearanceSettingsSection: React.FC<AppearanceSettingsSectionProps> = ({
  resolved,
  currentParity,
  onUpdate,
}) => {
  const goalSliderId = useId();
  const semesterDateId = useId();

  return (
    <GlassCard variant="glass" padding="lg" className="space-y-5">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
        <Palette weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
        <span>Оформлення та параметри розкладу</span>
      </div>

      {/* Theme Mode */}
      <div className="space-y-2">
        <span className="block text-xs font-medium text-ink">Тема інтерфейсу</span>
        <SegmentedControl
          options={THEME_OPTIONS}
          value={resolved.theme}
          onChange={(nextTheme) => onUpdate({ theme: nextTheme })}
          layoutId="settings-theme-mode"
          ariaLabel="Тема інтерфейсу"
          size="sm"
          fullWidth
          className="min-w-0 w-full [&>button]:min-w-0 [&>button]:px-1.5 xs:[&>button]:px-2.5"
        />
      </div>

      {/* Target Attendance Goal */}
      <div className="rounded-xl border border-line bg-surface-elevated/55 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <label
            htmlFor={goalSliderId}
            className="inline-flex items-center gap-2 text-xs font-medium text-ink"
          >
            <Target weight="duotone" className="h-3.5 w-3.5 text-amber-fg" aria-hidden="true" />
            <span>Ціль відвідуваності</span>
          </label>
          <span className="font-mono text-sm font-bold tabular-nums text-amber-fg">
            {resolved.attendanceGoal}%
          </span>
        </div>
        <input
          id={goalSliderId}
          type="range"
          min={50}
          max={100}
          step={1}
          value={resolved.attendanceGoal}
          aria-valuetext={`${resolved.attendanceGoal}%`}
          onChange={(e) => onUpdate({ attendanceGoal: Number(e.target.value) })}
          className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-[var(--accent-amber)]"
        />
        <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-ink-muted">
          <span>50%</span>
          <span>75%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Show Weekends Toggle */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-elevated/55 px-3.5 py-3">
        <div>
          <span className="block text-xs font-semibold text-ink">
            Показувати вихідні (Сб / Нд)
          </span>
          <span className="mt-0.5 block text-[11px] text-ink-secondary">
            Додає суботу та неділю до стрічки днів і тижневої сітки
          </span>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={resolved.showWeekends}
          aria-label="Показувати вихідні (Сб / Нд)"
          onClick={() => onUpdate({ showWeekends: !resolved.showWeekends })}
          className={[
            'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-150',
            resolved.showWeekends
              ? 'border-amber/60 bg-amber'
              : 'border-line-strong bg-surface',
          ].join(' ')}
        >
          <span
            aria-hidden="true"
            className={[
              'inline-block h-4 w-4 rounded-full bg-surface-elevated shadow-sm transition-transform duration-150',
              resolved.showWeekends ? 'translate-x-5 bg-surface' : 'translate-x-1',
            ].join(' ')}
          />
        </button>
      </div>

      {/* Semester Start Date */}
      <div className="space-y-2 rounded-xl border border-line bg-surface-elevated/55 p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor={semesterDateId}
            className="inline-flex items-center gap-2 text-xs font-medium text-ink"
          >
            <CalendarBlank weight="duotone" className="h-3.5 w-3.5 text-amber-fg" aria-hidden="true" />
            <span>Початок семестру (для чисельника/знаменника)</span>
          </label>

          <MetaChip variant={currentParity === 'numerator' ? 'amber' : 'beige'} mono>
            Зараз: {currentParity === 'numerator' ? 'Чисельник' : 'Знаменник'}
          </MetaChip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            id={semesterDateId}
            type="date"
            value={resolved.semesterStartDate}
            onChange={(e) => {
              const next = e.target.value;
              if (isValidIsoDate(next)) {
                onUpdate({ semesterStartDate: next });
              }
            }}
            className="min-h-[38px] flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
          />
          {resolved.semesterStartDate !== DEFAULT_SEMESTER_START_DATE && (
            <button
              type="button"
              onClick={() => onUpdate({ semesterStartDate: DEFAULT_SEMESTER_START_DATE })}
              className="min-h-[38px] rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-secondary hover:border-line-strong hover:text-ink"
            >
              01.09.2026
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
