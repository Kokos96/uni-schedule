import React, { useId, useMemo, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  BookOpen,
  Buildings,
  CalendarBlank,
  DeviceMobile,
  Export,
  Laptop,
  Monitor,
  Moon,
  Palette,
  Target,
  Users,
} from '@phosphor-icons/react';
import {
  AttendanceRecord,
  DepartmentType,
  ElectiveType,
  ThemeMode,
  UserSettings,
} from '../../types';
import { UniScheduleBackupData } from '../../types/backup';
import { DeadlineItem, LessonNote } from '../../types/notes';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../hooks/useSettings';
import { DEFAULT_SEMESTER_START_DATE, getWeekParity, isValidIsoDate } from '../../utils/date';
import { MetaChip, StatusDot } from '../ui/Badge';
import { EditorialUnderline } from '../ui/EditorialOrnaments';
import { GlassCard } from '../ui/GlassCard';
import { ModalDrawer } from '../ui/ModalDrawer';
import { SegmentedControl, SegmentedOption } from '../ui/SegmentedControl';
import { useToast } from '../ui/Toast';
import { BackupImportMeta, BackupSection } from './BackupSection';

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
}

const DEPARTMENTS: Array<{ id: DepartmentType; label: string; sub: string }> = [
  { id: 'sp', label: 'СП', sub: 'Системне проектування (NoSQL бази)' },
  { id: 'oit', label: 'ОІТ', sub: 'Оптоелектроніка та ІТ (NoSQL бази)' },
  { id: 'rks', label: 'РКС', sub: 'Радіоелектронні та комп. системи (Мова C)' },
  { id: 'rkt', label: 'РКТ', sub: 'Радіофізика та комп. технології (Мова C)' },
];

const ELECTIVES: Array<{ id: ElectiveType; label: string; hint: string }> = [
  { id: 'freelance', label: 'Freelance: робота онлайн', hint: 'Понеділок · вибіркова' },
  { id: 'management', label: 'Інноваційний менеджмент', hint: 'Понеділок · вибіркова' },
  { id: 'space', label: 'Людина і космос', hint: 'Понеділок · вибіркова' },
  { id: 'both', label: 'Показувати всі', hint: 'Відображати всі вибіркові пари' },
];

type SubgroupString = '1' | '2';

const SUBGROUP_OPTIONS: Array<SegmentedOption<SubgroupString>> = [
  { value: '1', label: '1-ша підгрупа' },
  { value: '2', label: '2-га підгрупа' },
];

const THEME_OPTIONS: Array<SegmentedOption<ThemeMode>> = [
  { value: 'dark', label: 'Темна', icon: <Moon weight="duotone" className="h-3.5 w-3.5" /> },
  { value: 'light', label: 'Світла', icon: <SunIcon /> },
  { value: 'system', label: 'Системна', icon: <Monitor weight="duotone" className="h-3.5 w-3.5" /> },
];

function SunIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

const NOOP = () => {};

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
}) => {
  const { toast } = useToast();
  const goalSliderId = useId();
  const semesterDateId = useId();
  const deptRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const electiveRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);

  const resolved = useMemo(() => normalizeSettings(settings), [settings]);
  const currentParity = useMemo(
    () => getWeekParity(new Date(), resolved.semesterStartDate),
    [resolved.semesterStartDate]
  );

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
          ФЕП-33с · {resolved.department.toUpperCase()} · Підгр. {resolved.subgroup}
        </MetaChip>
      </div>

      {/* 2-Column Desktop / 1-Column Mobile Layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Academic Profile & Appearance */}
        <div className="space-y-6 lg:col-span-7">
          {/* 1. Department Radio Cards */}
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
              {DEPARTMENTS.map((dept, index) => {
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
                      handleRadioGroupKeyDown(e, DEPARTMENTS, index, deptRefs, (id) =>
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

          {/* 2. Subgroup */}
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

          {/* 3. Elective Course */}
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
              {ELECTIVES.map((elective, index) => {
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
                      handleRadioGroupKeyDown(e, ELECTIVES, index, electiveRefs, (id) =>
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

          {/* 4. Appearance & Schedule Preferences */}
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
        </div>

        {/* Right Column: Data Portability, Reset Settings, App Info & PWA Install */}
        <div className="space-y-6 lg:col-span-5">
          {/* 5. Data Management (BackupSection + Reset Settings) */}
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
                  Повертає кафедру, підгрупу, тему та ціль до стандартних значень без видалення
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

          {/* 6. App Info & PWA Install Card */}
          <GlassCard variant="amber-lit" brackets padding="lg" className="space-y-4">
            <div className="flex items-center gap-3.5">
              <img
                src="/icons/icon-192.png"
                alt="Іконка uni-schedule 2.0"
                width={52}
                height={52}
                className="h-[52px] w-[52px] shrink-0 rounded-2xl shadow-elevated"
              />
              <div className="min-w-0">
                <h3 className="font-serif text-sm font-bold tracking-tight text-ink">
                  uni-schedule 2.0 · Graphite Glass
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

      {/* Confirm Reset Settings ModalDrawer */}
      <ModalDrawer
        open={confirmResetOpen}
        onClose={() => setConfirmResetOpen(false)}
        title="Скинути налаштування?"
        description="Відвідуваність, нотатки та дедлайни залишаться без змін"
      >
        <div className="space-y-4">
          <p className="text-xs leading-relaxed text-ink-secondary">
            Буде відновлено стандартні налаштування: кафедра СП, 1-ша підгрупа, темна тема, ціль
            відвідуваності 80% та дата початку семестру 2026-09-01.
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
