import React from 'react';
import { GraduationCap } from '@phosphor-icons/react';
import { DEPARTMENT_OPTIONS } from '../../constants/profile';
import type { ScheduleActivationResult, ScheduleSyncStatus } from '../../hooks/useScheduleSource';
import type { UseSettingsResult } from '../../hooks/useSettings';
import type { StudentSelection } from '../../integrations/universities/types';
import type { ResolvedUserSettings, UserSettings } from '../../types';
import { SegmentedControl, type SegmentedOption } from '../ui/SegmentedControl';
import { UniversitySelectorCard } from '../settings/UniversitySelectorCard';

const SUBGROUP_OPTIONS: Array<SegmentedOption<'1' | '2'>> = [
  { value: '1', label: '1-ша підгрупа' },
  { value: '2', label: '2-га підгрупа' },
];

export interface FirstLaunchOnboardingProps {
  settings: ResolvedUserSettings;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
  syncStatus: ScheduleSyncStatus;
  lastSyncedAt: string | null;
  syncError: string | null;
  profileSyncStatus: UseSettingsResult['profileSyncStatus'];
  profileSyncError: string | null;
  onConfirmProfileOverwrite: () => void;
  onActivateGroupSchedule?: (
    selection: StudentSelection,
    options?: { force?: boolean }
  ) => Promise<ScheduleActivationResult>;
  onSyncGroupSchedule: (selection: StudentSelection, options?: { force?: boolean }) => Promise<boolean>;
}

export const FirstLaunchOnboarding: React.FC<FirstLaunchOnboardingProps> = ({
  settings,
  onUpdate,
  syncStatus,
  lastSyncedAt,
  syncError,
  profileSyncStatus,
  profileSyncError,
  onConfirmProfileOverwrite,
  onActivateGroupSchedule,
  onSyncGroupSchedule,
}) => {
  return (
    <div className="mx-auto w-full max-w-xl space-y-5 py-4">
      <div className="space-y-2 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-amber/30 bg-amber-soft text-amber-fg">
          <GraduationCap weight="duotone" className="h-6 w-6" aria-hidden="true" />
        </div>
        <h2 className="font-serif text-2xl font-bold tracking-[-0.02em] text-ink">
          Налаштування розкладу
        </h2>
        <p className="text-sm text-ink-secondary">
          Оберіть університет, факультет та вашу академічну групу, щоб завантажити актуальний розклад занять.
        </p>
      </div>

      <UniversitySelectorCard
        resolved={settings}
        onUpdate={onUpdate}
        syncStatus={syncStatus}
        lastSyncedAt={lastSyncedAt}
        syncError={syncError}
        profileSyncStatus={profileSyncStatus}
        profileSyncError={profileSyncError}
        onConfirmProfileOverwrite={onConfirmProfileOverwrite}
        onActivateGroupSchedule={onActivateGroupSchedule}
        onSyncGroupSchedule={onSyncGroupSchedule}
      />

      <div className="rounded-2xl border border-line bg-surface-elevated/60 p-4 space-y-3">
        <div className="text-xs font-semibold text-ink">Підгрупа (для лабораторних та практичних)</div>
        <SegmentedControl
          value={String(settings.subgroup) as '1' | '2'}
          onChange={(val) => onUpdate({ subgroup: val === '2' ? 2 : 1 })}
          options={SUBGROUP_OPTIONS}
          ariaLabel="Вибір підгрупи"
        />
        <p className="text-[11px] text-ink-muted">
          Кафедру (для груп ФЕП-31с–34с) та вибіркові предмети (ДВВС) можна додатково уточнити одразу після завантаження розкладу в розділі «Опції».
        </p>
      </div>

      <div className="sr-only" aria-hidden="true">
        {DEPARTMENT_OPTIONS.map((d) => d.label).join(', ')}
      </div>
    </div>
  );
};
