import React, { useMemo, useState } from 'react';
import { CaretLeft, CaretRight, Funnel } from '@phosphor-icons/react';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../hooks/useSettings';
import type { AttendanceRecord, Lesson, UserSettings } from '../../types';
import {
  computeAttendanceSummary,
  computeMonthDelta,
  computeSubjectStats,
  filterRecordsByMonth,
  filterRecordsBySettings,
} from '../../utils/attendanceMath';
import { MONTH_NAMES_UA, formatYearMonth } from '../../utils/date';
import { lessonsMap } from '../../utils/schedule';
import { EditorialUnderline } from '../ui/EditorialOrnaments';
import { SegmentedControl, SegmentedOption } from '../ui/SegmentedControl';
import { AttendanceCalculator } from './AttendanceCalculator';
import { AttendanceRingCard } from './AttendanceRingCard';
import { AttendanceTrends } from './AttendanceTrends';
import { SubjectAttendanceList } from './SubjectAttendanceList';

export interface StatsViewProps {
  records: AttendanceRecord[];
  settings?: UserSettings;
  scheduleMap?: Map<string, Lesson>;
  onUpdateSettings?: (newSettings: Partial<UserSettings>) => void;
}

type FilterMode = 'month' | 'all';

const FILTER_OPTIONS: Array<SegmentedOption<FilterMode>> = [
  { value: 'month', label: 'По місяцях' },
  { value: 'all', label: 'Весь семестр' },
];

export const StatsView: React.FC<StatsViewProps> = ({
  records,
  settings,
  scheduleMap,
  onUpdateSettings,
}) => {
  const activeScheduleMap = scheduleMap && scheduleMap.size > 0 ? scheduleMap : lessonsMap;
  const [filterMode, setFilterMode] = useState<FilterMode>('month');
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [onlyMyLessons, setOnlyMyLessons] = useState<boolean>(true);
  const [fallbackGoal, setFallbackGoal] = useState<number>(DEFAULT_SETTINGS.attendanceGoal);

  const resolvedSettings = useMemo(
    () => normalizeSettings(settings ?? DEFAULT_SETTINGS),
    [settings]
  );

  const goalPercent =
    settings && typeof settings.attendanceGoal === 'number'
      ? resolvedSettings.attendanceGoal
      : fallbackGoal;

  const handleGoalChange = (nextGoal: number) => {
    const clamped = Math.min(100, Math.max(50, Math.round(nextGoal)));
    if (onUpdateSettings) {
      onUpdateSettings({ attendanceGoal: clamped });
    } else {
      setFallbackGoal(clamped);
    }
  };

  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIndex = selectedDate.getMonth();
  const selectedMonthTitle = MONTH_NAMES_UA[selectedMonthIndex] ?? '';
  const selectedYearMonth = formatYearMonth(selectedDate);
  const currentYearMonth = formatYearMonth(new Date());
  const isCurrentMonth = selectedYearMonth === currentYearMonth;

  const changeMonth = (offset: number) => {
    setSelectedDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + offset, 1));
  };

  const scopedRecords = useMemo(
    () =>
      onlyMyLessons
        ? filterRecordsBySettings(
            records,
            {
              department: resolvedSettings.department,
              subgroup: resolvedSettings.subgroup,
              electiveCourse: resolvedSettings.electiveCourse,
              selectedElectives: resolvedSettings.selectedElectives,
              selectedTrack: resolvedSettings.selectedTrack,
            },
            activeScheduleMap
          )
        : records,
    [
      records,
      onlyMyLessons,
      resolvedSettings.department,
      resolvedSettings.subgroup,
      resolvedSettings.electiveCourse,
      resolvedSettings.selectedElectives,
      resolvedSettings.selectedTrack,
      activeScheduleMap,
    ]
  );

  const periodRecords = useMemo(
    () =>
      filterMode === 'month'
        ? filterRecordsByMonth(scopedRecords, selectedYearMonth)
        : scopedRecords,
    [filterMode, scopedRecords, selectedYearMonth]
  );

  const summary = useMemo(() => computeAttendanceSummary(periodRecords), [periodRecords]);
  const monthDelta = useMemo(
    () => computeMonthDelta(scopedRecords, selectedDate),
    [scopedRecords, selectedDate]
  );
  const subjectStats = useMemo(
    () => computeSubjectStats(periodRecords, activeScheduleMap, goalPercent),
    [periodRecords, activeScheduleMap, goalPercent]
  );

  const hiddenByFilterCount = records.length - scopedRecords.length;
  const unmatchedByScheduleCount = records.filter(
    (record) => !activeScheduleMap.has(record.lessonId)
  ).length;
  const excludedByProfileCount = Math.max(0, hiddenByFilterCount - unmatchedByScheduleCount);
  const departmentLabelMap: Record<string, string> = {
    sp: 'СП',
    oit: 'ОІТ',
    rks: 'РКС',
    rkt: 'РКТ',
  };
  const profileFilterLabel = resolvedSettings.scheduleSourceMode === 'builtin'
    ? `${departmentLabelMap[resolvedSettings.department] ?? resolvedSettings.department.toUpperCase()} · ${resolvedSettings.subgroup}-ша підгрупа`
    : resolvedSettings.universityProfile?.groupName || 'Поточний розклад';
  const periodLabel =
    filterMode === 'month' ? `${selectedMonthTitle} ${selectedYear}` : 'Весь семестр';

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 px-4 py-5 pb-28 md:px-6 md:pb-10">
      {/* Header & Filter Controls */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-amber-fg">
            Аналітика семестру
          </span>
          <h2 className="mt-0.5 font-serif text-2xl font-bold tracking-[-0.02em] text-ink">
            Відвідуваність
          </h2>
          <EditorialUnderline width={104} className="mt-1.5" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedControl
            options={FILTER_OPTIONS}
            value={filterMode}
            onChange={setFilterMode}
            layoutId="stats-period-mode"
            ariaLabel="Період аналітики відвідуваності"
            size="md"
          />

          {filterMode === 'month' && (
            <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-surface-elevated/90 px-1.5 py-1">
              <button
                type="button"
                onClick={() => changeMonth(-1)}
                aria-label="Попередній місяць"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface hover:text-ink active:scale-95"
              >
                <CaretLeft weight="bold" className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="min-w-[128px] px-2 text-center text-xs font-semibold text-ink">
                {selectedMonthTitle} {selectedYear}
              </span>
              <button
                type="button"
                onClick={() => changeMonth(1)}
                aria-label="Наступний місяць"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface hover:text-ink active:scale-95"
              >
                <CaretRight weight="bold" className="h-4 w-4" aria-hidden="true" />
              </button>
              {!isCurrentMonth && (
                <button
                  type="button"
                  onClick={() => setSelectedDate(new Date())}
                  aria-label="Перейти до поточного місяця"
                  className="ml-0.5 rounded-lg border border-amber/30 bg-amber-soft px-2 py-1 text-[11px] font-medium text-amber-fg transition-colors hover:bg-amber/20"
                >
                  Сьогодні
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Scope toggle bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3">
        <div className="flex items-center gap-2.5 text-xs text-ink-secondary">
          <Funnel weight="duotone" className="h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
          <span>
            Фільтр профілю:{' '}
            <strong className="font-semibold text-ink">
              {profileFilterLabel}
            </strong>
          </span>
          {onlyMyLessons && unmatchedByScheduleCount > 0 && (
            <span className="text-[11px] text-ink-muted">
              {unmatchedByScheduleCount} відміток не зіставлено з поточним розкладом; вони збережені
            </span>
          )}
          {onlyMyLessons && excludedByProfileCount > 0 && (
            <span className="text-[11px] text-ink-muted">
              {excludedByProfileCount} відміток не входять до фільтра профілю
            </span>
          )}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={onlyMyLessons}
          onClick={() => setOnlyMyLessons((prev) => !prev)}
          className="inline-flex items-center gap-2.5 rounded-xl px-1 py-0.5 text-xs font-medium text-ink transition-colors hover:text-amber-fg"
        >
          <span>Лише пари поточного профілю</span>
          <span
            aria-hidden="true"
            className={[
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-150',
              onlyMyLessons
                ? 'border-amber/60 bg-amber'
                : 'border-line-strong bg-surface-elevated',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block h-3.5 w-3.5 rounded-full bg-surface shadow-sm transition-transform duration-150',
                onlyMyLessons ? 'translate-x-4' : 'translate-x-0.5',
              ].join(' ')}
            />
          </span>
        </button>
      </div>

      {/* Main 12-column analytics grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <AttendanceRingCard
          summary={summary}
          monthDelta={monthDelta}
          filterMode={filterMode}
          periodLabel={periodLabel}
        />

        <AttendanceCalculator
          attended={summary.attended}
          total={summary.totalMarked}
          goalPercent={goalPercent}
          onGoalChange={handleGoalChange}
          className="lg:col-span-7"
        />

        <AttendanceTrends
          records={scopedRecords}
          goalPercent={goalPercent}
          maxWeeks={8}
          className="lg:col-span-12"
        />

        <SubjectAttendanceList
          subjectStats={subjectStats}
          heading={
            filterMode === 'month'
              ? `Предмети за ${selectedMonthTitle.toLowerCase()}`
              : 'Усі предмети за семестр'
          }
          onlyMyLessons={onlyMyLessons}
          hiddenByFilterCount={hiddenByFilterCount}
          onShowAllLessons={() => setOnlyMyLessons(false)}
        />
      </div>
    </div>
  );
};
