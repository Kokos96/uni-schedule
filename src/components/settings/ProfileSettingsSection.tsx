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
  isUsingCustomGroup?: boolean;
  availableElectives?: Array<{ key: string; subject: string }>;
  availableTracks?: Array<{ number: number; subjects: string[] }>;
}

export const ProfileSettingsSection: React.FC<ProfileSettingsSectionProps> = ({
  resolved,
  onUpdate,
  syncStatus,
  lastSyncedAt,
  syncError,
  onSyncGroupSchedule,
  onResetBuiltinSchedule,
  isUsingCustomGroup = false,
  availableElectives = [],
  availableTracks = [],
}) => {
  const deptRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const electiveRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedElectives = resolved.selectedElectives ?? [];

  const toggleLiveElective = (key: string) => {
    const next = selectedElectives.includes(key)
      ? selectedElectives.filter((k) => k !== key)
      : [...selectedElectives, key];
    onUpdate({ selectedElectives: next });
  };

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

      {!isUsingCustomGroup && (
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
      )}

      {isUsingCustomGroup && availableTracks.length > 0 && (
        <GlassCard variant="glass" padding="lg">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
            <Buildings weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
            <span>Профіль / Потік групи</span>
          </div>
          <p className="mt-1 text-xs text-ink-secondary">
            У розкладі знайдено пронумеровані варіанти курсів. Обери свій або залиш усі.
          </p>
          <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onUpdate({ selectedTrack: undefined })}
              className={[
                'flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-colors',
                resolved.selectedTrack === undefined
                  ? 'border-amber/55 bg-amber-soft text-amber-fg'
                  : 'border-line bg-surface-elevated/60 text-ink hover:bg-surface-elevated',
              ].join(' ')}
            >
              <span>Показувати всі варіанти</span>
              {resolved.selectedTrack === undefined && <StatusDot tone="amber" size="sm" />}
            </button>
            {availableTracks.map((track) => {
              const isSelected = resolved.selectedTrack === track.number;
              return (
                <button
                  key={track.number}
                  type="button"
                  onClick={() => onUpdate({ selectedTrack: track.number })}
                  className={[
                    'flex items-center justify-between gap-2 rounded-xl border px-3.5 py-2.5 text-left text-xs font-semibold transition-colors',
                    isSelected
                      ? 'border-amber/55 bg-amber-soft text-amber-fg'
                      : 'border-line bg-surface-elevated/60 text-ink hover:bg-surface-elevated',
                  ].join(' ')}
                >
                  <span className="truncate">{track.subjects.join(', ')}</span>
                  {isSelected && <StatusDot tone="amber" size="sm" />}
                </button>
              );
            })}
          </div>
        </GlassCard>
      )}

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
          <span>Вибіркові дисципліни (ДВВС)</span>
        </div>

        {isUsingCustomGroup ? (
          availableElectives.length > 0 ? (
            <>
              <p className="mt-1 text-xs text-ink-secondary">
                Обери лише ті ДВВС, на які ти записався(лась). Необрані вибіркові пари приховуються.
              </p>
              <div className="mt-3.5 divide-y divide-line/70 overflow-hidden rounded-xl border border-line bg-surface-elevated/50">
                {availableElectives.map((elective) => {
                  const isChecked = selectedElectives.includes(elective.key);
                  return (
                    <button
                      key={elective.key}
                      type="button"
                      role="checkbox"
                      aria-checked={isChecked}
                      onClick={() => toggleLiveElective(elective.key)}
                      className={[
                        'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors duration-150',
                        isChecked ? 'bg-amber-soft/75' : 'hover:bg-surface-elevated/80',
                      ].join(' ')}
                    >
                      <span
                        className={[
                          'text-xs font-semibold',
                          isChecked ? 'text-amber-fg' : 'text-ink',
                        ].join(' ')}
                      >
                        {elective.subject}
                      </span>
                      {isChecked ? (
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
            </>
          ) : (
            <p className="mt-2 text-xs text-ink-secondary">
              У завантаженому розкладі цієї групи вибіркових дисциплін (ДВВС) не виявлено.
            </p>
          )
        ) : (
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
        )}
      </GlassCard>
    </>
  );
};
