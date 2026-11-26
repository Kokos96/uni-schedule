import React, { useMemo, useState } from 'react';
import {
  ArrowCounterClockwise,
  DeviceMobile,
  Export,
  Laptop,
} from '@phosphor-icons/react';
import { DEPARTMENT_OPTIONS } from '../../constants/profile';
import { DEFAULT_SETTINGS, normalizeSettings, type UseSettingsResult } from '../../hooks/useSettings';
import type { ScheduleActivationResult, ScheduleSyncStatus } from '../../hooks/useScheduleSource';
import type { StudentSelection } from '../../integrations/universities/types';
import type { AttendanceRecord, UserSettings } from '../../types';
import type { UniScheduleBackupData } from '../../types/backup';
import type { DeadlineItem, LessonNote } from '../../types/notes';
import { getWeekParity } from '../../utils/date';
import type { ParallelGroupDimension } from '../../utils/parallelGroups';
import { MetaChip } from '../ui/Badge';
import { EditorialUnderline } from '../ui/EditorialOrnaments';
import { GlassCard } from '../ui/GlassCard';
import { ModalDrawer } from '../ui/ModalDrawer';
import { useToast } from '../ui/Toast';
import { AppearanceSettingsSection } from './AppearanceSettingsSection';
import { BackupImportMeta, BackupSection } from './BackupSection';
import { NotificationsSettingsSection } from './NotificationsSettingsSection';
import { ProfileSettingsSection } from './ProfileSettingsSection';

export interface SettingsViewProps {
  settings: UserSettings;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
  onResetSettings?: () => void;
  attendanceRecords?: readonly AttendanceRecord[];
  notes?: readonly LessonNote[];
  deadlines?: readonly DeadlineItem[];
  onImportReplace?: (data: UniScheduleBackupData, meta?: BackupImportMeta) => void;
  onImportMerge?: (data: UniScheduleBackupData, meta?: BackupImportMeta) => void;
  onClearAll?: () => void;
  syncStatus?: ScheduleSyncStatus;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  profileSyncStatus?: UseSettingsResult['profileSyncStatus'];
  profileSyncError?: string | null;
  onConfirmProfileOverwrite?: () => void;
  onActivateGroupSchedule?: (
    selection: StudentSelection,
    options?: { force?: boolean }
  ) => Promise<ScheduleActivationResult>;
  onSyncGroupSchedule?: (selection: StudentSelection, options?: { force?: boolean }) => Promise<boolean>;
  onResetBuiltinSchedule?: () => void;
  isUsingCustomGroup?: boolean;
  availableElectives?: Array<{ key: string; subject: string }>;
  availableTracks?: Array<{ number: number; subjects: string[] }>;
  availableParallelGroups?: ParallelGroupDimension[];
  hasSubgroups?: boolean;
  hasDepartments?: boolean;
}

const NOOP = () => {};

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdate,
  onResetSettings,
  attendanceRecords = [],
  notes = [],
  deadlines = [],
  onImportReplace = NOOP,
  onImportMerge = NOOP,
  onClearAll = NOOP,
  syncStatus,
  lastSyncedAt,
  syncError,
  profileSyncStatus = 'idle',
  profileSyncError,
  onConfirmProfileOverwrite,
  onActivateGroupSchedule,
  onSyncGroupSchedule,
  onResetBuiltinSchedule,
  isUsingCustomGroup = false,
  availableElectives = [],
  availableTracks = [],
  availableParallelGroups = [],
  hasSubgroups = true,
  hasDepartments = false,
}) => {
  const { toast } = useToast();
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const resolved = useMemo(() => normalizeSettings(settings), [settings]);
  const currentParity = useMemo(
    () => getWeekParity(new Date(), resolved.semesterStartDate),
    [resolved.semesterStartDate]
  );

  const departmentLabel =
    DEPARTMENT_OPTIONS.find((d) => d.id === resolved.department)?.label ?? resolved.department;
  const profileBadge = resolved.scheduleSourceMode === 'builtin'
    ? `ФЕП-33с · ${departmentLabel}${hasSubgroups ? ` · Підгр. ${resolved.subgroup}` : ''}`
    : resolved.scheduleSourceMode === 'unconfigured'
      ? 'Профіль не налаштовано'
      : resolved.scheduleSourceMode === 'manual'
        ? `${resolved.universityProfile?.groupName || 'Група не обрана'} · Ручний режим`
        : `${resolved.universityProfile?.groupName || 'Група не обрана'} · ${syncStatus === 'synced' ? 'Розклад завантажено' : syncStatus === 'syncing' ? 'Синхронізація…' : syncStatus === 'error' ? 'Помилка розкладу' : 'Очікує синхронізації'}${hasSubgroups && isUsingCustomGroup ? ` · Підгр. ${resolved.subgroup}` : ''}`;

  const handleResetSettings = () => {
    if (onResetSettings) {
      onResetSettings();
    } else {
      onUpdate({ ...DEFAULT_SETTINGS });
    }
    setConfirmResetOpen(false);
    toast.success('Налаштування скинуто за замовчуванням');
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 pb-28 md:px-6 md:pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-amber-fg">
            Профіль та система
          </span>
          <h2 className="mt-0.5 font-serif text-2xl font-bold tracking-[-0.02em] text-ink">
            Налаштування
          </h2>
          <EditorialUnderline width={104} className="mt-1.5" />
        </div>

        <MetaChip variant="amber" mono>
          {profileBadge}
        </MetaChip>
      </div>

      {/* 2-Column Desktop / 1-Column Mobile Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <ProfileSettingsSection
            resolved={resolved}
            onUpdate={onUpdate}
            syncStatus={syncStatus}
            lastSyncedAt={lastSyncedAt}
            syncError={syncError}
            profileSyncStatus={profileSyncStatus}
            profileSyncError={profileSyncError}
            onConfirmProfileOverwrite={onConfirmProfileOverwrite}
            onActivateGroupSchedule={onActivateGroupSchedule}
            onSyncGroupSchedule={onSyncGroupSchedule}
            onResetBuiltinSchedule={onResetBuiltinSchedule}
            isUsingCustomGroup={isUsingCustomGroup}
            availableElectives={availableElectives}
            availableTracks={availableTracks}
            availableParallelGroups={availableParallelGroups}
            hasSubgroups={hasSubgroups}
            hasDepartments={hasDepartments}
          />
          <AppearanceSettingsSection
            resolved={resolved}
            currentParity={currentParity}
            onUpdate={onUpdate}
          />
        </div>

        <div className="space-y-6 lg:col-span-5">
          <NotificationsSettingsSection />

          <BackupSection
            attendanceRecords={attendanceRecords}
            settings={resolved}
            notes={notes}
            deadlines={deadlines}
            onImportReplace={onImportReplace}
            onImportMerge={onImportMerge}
            onClearAll={onClearAll}
          />

          <GlassCard variant="matte" padding="md">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-serif text-xs font-semibold text-ink">
                  Скинути параметри профілю
                </h3>
                <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">
                  Повертає вбудований розклад, кафедру, підгрупу, тему та ціль до стандартних значень без видалення
                  відміток чи нотаток.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmResetOpen(true)}
                className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-amber/45 hover:text-amber-fg active:scale-[0.98]"
              >
                <ArrowCounterClockwise weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Скинути</span>
              </button>
            </div>
          </GlassCard>

          <GlassCard variant="amber-lit" brackets padding="lg" className="space-y-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/icons/icon-192.png"
                alt="Іконка Uni Schedule"
                width={52}
                height={52}
                className="h-[52px] w-[52px] shrink-0 rounded-2xl shadow-elevated"
              />
              <div className="min-w-0">
                <h3 className="font-serif text-sm font-bold tracking-tight text-ink">
                  Uni Schedule v4.2.1
                </h3>
                <p className="mt-0.5 text-xs text-ink-secondary">
                  Розклад занять, відвідуваність, нотатки та дедлайни (PWA)
                </p>
              </div>
            </div>

            <div className="space-y-2.5 border-t border-line/70 pt-3.5 text-xs text-ink-secondary">
              <div className="flex items-start gap-2.5">
                <DeviceMobile weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-ink">iOS Safari (iPhone / iPad):</p>
                  <p className="mt-0.5 inline-flex flex-wrap items-center gap-1 leading-relaxed">
                    <span>Натисніть</span>
                    <Export weight="regular" className="inline h-3.5 w-3.5 text-amber-fg" aria-hidden="true" />
                    <span>«Поділитися» ➔ «На початковий екран».</span>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <Laptop weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-ink">Desktop Chrome / Edge:</p>
                  <p className="mt-0.5 leading-relaxed">
                    Натисніть іконку встановлення в адресному рядку браузера або оберіть у меню
                    «Встановити застосунок».
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>

      <ModalDrawer
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Скинути налаштування?"
        description="Відвідуваність, нотатки та дедлайни залишаться без змін"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-ink-secondary">
            Буде скинуто налаштування оформлення, кафедри (СП), 1-ї підгрупи, цілі відвідуваності (80%) та дати початку семестру.
            Обрана група, відвідуваність, нотатки та дедлайни залишаться без змін.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setConfirmResetOpen(false)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-line bg-surface-elevated px-4 py-2 text-xs font-semibold text-ink hover:border-line-strong"
            >
              Скасувати
            </button>
            <button
              type="button"
              onClick={handleResetSettings}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-amber/50 bg-amber-soft px-4 py-2 text-xs font-semibold text-amber-fg hover:bg-amber/20"
            >
              <ArrowCounterClockwise weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Скинути налаштування</span>
            </button>
          </div>
        </div>
      </ModalDrawer>
    </div>
  );
};
