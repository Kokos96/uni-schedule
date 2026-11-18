import React, { useRef } from 'react';
import { BookOpen, Buildings, Users } from '@phosphor-icons/react';
import { DEPARTMENT_OPTIONS, ELECTIVE_OPTIONS } from '../../constants/profile';
import type { ScheduleSyncStatus } from '../../hooks/useScheduleSource';
import type { StudentSelection } from '../../integrations/universities/types';
import type { ResolvedUserSettings, UserSettings } from '../../types';
import { StatusDot } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { UniversitySelectorCard } from './UniversitySelectorCard';

type SubgroupString = '1' | '2';

const SUBGROUP_OPTIONS: Array<SegmentedOption<SubgroupString>> = [
  { value: '1', label: '1-ша підгрупа' },
  { value: '2', label: '2-га підгрупа' },
];

function handleRadioGroupKeyDown<T extends string>(
  event: React.KeyboardEvent<HTMLButtonElement>,
  items: ReadonlyArray<{ id: T }>,
  currentIndex: number,
  refs: React.MutableRefObject<Array<HTMLButtonElement | null>>,
  onSelect: (id: T) => void
) {
  let nextIndex: number | undefined;
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    event.preventDefault();
    nextIndex = (currentIndex + 1) % items.length;
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    event.preventDefault();
    nextIndex = (currentIndex - 1 + items.length) % items.length;
  } else if (event.key === 'Home') {
    event.preventDefault();
    nextIndex = 0;
  } else if (event.key === 'End') {
    event.preventDefault();
    nextIndex = items.length - 1;
  }

  if (nextIndex !== undefined) {
    const nextItem = items[nextIndex];
    if (nextItem) {
      onSelect(nextItem.id);
      refs.current[nextIndex]?.focus();
    }
  }
}

export interface ProfileSettingsSectionProps {
  resolved: ResolvedUserSettings;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
  syncStatus?: ScheduleSyncStatus;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  onSyncGroupSchedule?: (selection: StudentSelection) => Promise<boolean>;
  onResetBuiltinSchedule?: () => void;
}

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  resolved,
  onUpdate,
  syncStatus,
  lastSyncedAt,
  syncError,
  onSyncGroupSchedule,
  onResetBuiltinSchedule,
}) => {
  const deptRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const electiveRefs = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <>
      <UniversitySelectorCard
        resolved={resolved}
        onUpdate={onUpdate}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        syncError={syncError}
        onSyncGroupSchedule={onSyncGroupSchedule}
        onResetBuiltinSchedule={onResetBuiltinSchedule}
      />

      <GlassCard variant="glass" padding="lg">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          <Buildings weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
          <span>Твоя кафедра (Спецпотік)</span>
        </div>

        <div
          role="radiogroup"
          aria-label="Вибір кафедри"
          className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2"
        >
          {DEPARTMENT_OPTIONS.map((dept, index) => {
            const isSelected = resolved.department === dept.id;
            return (
              <button
                key={dept.id}
                ref={(el) => {
                  deptRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onUpdate({ department: dept.id })}
                onKeyDown={(e) =>
                  handleRadioGroupKeyDown(e, DEPARTMENT_OPTIONS, index, deptRefs, (id) =>
                    onUpdate({ department: id })
                  )
                }
                className={[
                  'flex items-start justify-between gap-3 rounded-xl border p-3.5 text-left transition-colors duration-150 active:scale-[0.99]',
                  isSelected
                    ? 'border-amber/55 bg-amber-soft shadow-elevated'
                    : 'border-line bg-surface-elevated/60 hover:border-line-strong hover:bg-surface-elevated',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <span
                    className={[
                      'block text-sm font-bold tracking-tight',
                      isSelected ? 'text-amber-fg' : 'text-ink',
                    ].join(' ')}
                  >
                    {dept.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-ink-secondary">
                    {dept.sub}
                  </span>
                </div>
                <span className="mt-1 shrink-0">
                  {isSelected ? (
                    <StatusDot tone="amber" size="md" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="inline-block h-2.5 w-2.5 rounded-full border border-line-strong"
                    />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </GlassCard>

      <GlassCard variant="glass" padding="lg">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          <Users weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
          <span>Підгрупа для лабораторних</span>
        </div>
        <p className="mt-1 text-xs text-ink-secondary">
          Визначає відображення лабораторних та практичних пар за підгрупами.
        </p>
        <div className="mt-3.5">
          <SegmentedControl
            options={SUBGROUP_OPTIONS}
            value={String(resolved.subgroup) as SubgroupString}
            onChange={(val) => onUpdate({ subgroup: val === '2' ? 2 : 1 })}
            layoutId="settings-subgroup"
            ariaLabel="Підгрупа для лабораторних"
            fullWidth
          />
        </div>
      </GlassCard>

      <GlassCard variant="glass" padding="lg">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          <BookOpen weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
          <span>Вибіркова дисципліна</span>
        </div>

        <div
          role="radiogroup"
          aria-label="Вибіркова дисципліна"
          className="mt-3.5 divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface-elevated/50"
        >
          {ELECTIVE_OPTIONS.map((elective, index) => {
            const isSelected = resolved.electiveCourse === elective.id;
            return (
              <button
                key={elective.id}
                ref={(el) => {
                  electiveRefs.current[index] = el;
                }}
                type="button"
                role="radio"
                aria-checked={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onUpdate({ electiveCourse: elective.id })}
                onKeyDown={(e) =>
                  handleRadioGroupKeyDown(e, ELECTIVE_OPTIONS, index, electiveRefs, (id) =>
                    onUpdate({ electiveCourse: id })
                  )
                }
                className={[
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150',
                  isSelected ? 'bg-amber-soft/75' : 'hover:bg-surface-elevated/80',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <span
                    className={[
                      'block text-xs font-semibold',
                      isSelected ? 'text-amber-fg' : 'text-ink',
                    ].join(' ')}
                  >
                    {elective.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-ink-secondary">
                    {elective.hint}
                  </span>
                </div>
                {isSelected ? (
                  <StatusDot tone="amber" size="md" />
                ) : (
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-line-strong"
                  />
                )}
              </button>
            );
          })}
        </div>
      </GlassCard>
    </>
  );
};
