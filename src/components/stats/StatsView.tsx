import React, { useMemo, useState } from 'react';
import {
  CalendarDots,
  CaretLeft,
  CaretRight,
  Funnel,
  Minus,
  TrendDown,
  TrendUp,
} from '@phosphor-icons/react';
import { AttendanceRecord, UserSettings } from '../../types';
import { DEFAULT_SETTINGS, normalizeSettings } from '../../hooks/useSettings';
import {
  computeAttendanceSummary,
  computeMonthDelta,
  computeSubjectStats,
  filterRecordsByMonth,
  filterRecordsBySettings,
  SubjectAttendanceStat,
} from '../../utils/attendanceMath';
import { formatYearMonth, MONTH_NAMES_UA } from '../../utils/date';
import { lessonsMap } from '../../utils/schedule';
import { AnimatedNumber, AnimatedProgressBar, StaggerCard, StaggerList } from '../motion/MotionPrimitives';
import { useAppReducedMotion } from '../../lib/motion';
import { MetaChip } from '../ui/Badge';
import { EditorialUnderline, EmptyAttendanceIllustration } from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';
import { SegmentedControl, SegmentedOption } from '../ui/SegmentedControl';
import { AttendanceCalculator } from './AttendanceCalculator';
import { AttendanceTrends } from './AttendanceTrends';

export interface StatsViewProps {
  records: AttendanceRecord[];
  settings?: UserSettings;
  onUpdateSettings?: (newSettings: Partial<UserSettings>) => void;
}

type FilterMode = 'month' | 'all';

const FILTER_OPTIONS: Array<SegmentedOption<FilterMode>> = [
  { value: 'month', label: 'По місяцях' },
  { value: 'all', label: 'Весь семестр' },
];

const RING_SIZE = 132;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 52;
const RING_STROKE = 11;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function getSubjectBarClass(stat: SubjectAttendanceStat): string {
  if (stat.target.isMeetingGoal) {
    return 'bg-none bg-sage';
  }
  if (!stat.target.isGoalReachable || (stat.percentage !== null && stat.percentage >= stat.target.goalPercent - 15)) {
    return 'bg-none bg-amber';
  }
  return 'bg-none bg-terracotta';
}

export const StatsView: React.FC<StatsViewProps> = ({
  records,
  settings,
  onUpdateSettings,
}) => {
  const reduced = useAppReducedMotion();
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
        ? filterRecordsBySettings(records, {
            department: resolvedSettings.department,
            subgroup: resolvedSettings.subgroup,
            electiveCourse: resolvedSettings.electiveCourse,
          })
        : records,
    [records, onlyMyLessons, resolvedSettings.department, resolvedSettings.subgroup, resolvedSettings.electiveCourse]
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
    () => computeSubjectStats(periodRecords, lessonsMap, goalPercent),
    [periodRecords, goalPercent]
  );

  // Build radial ring segments in Sage (present), Amber (excused), Terracotta (absent)
  const ringSegments = useMemo(() => {
    if (!summary.hasData || summary.totalMarked === 0) return [];
    const raw = [
      { key: 'present', count: summary.present, color: 'var(--chart-sage)' },
      { key: 'excused', count: summary.excused, color: 'var(--chart-amber)' },
      { key: 'absent', count: summary.absent, color: 'var(--chart-terracotta)' },
    ].filter((item) => item.count > 0);

    let offset = 0;
    return raw.map((item) => {
      const length = (item.count / summary.totalMarked) * RING_CIRCUMFERENCE;
      const segment = {
        ...item,
        dashArray: `${length} ${Math.max(0, RING_CIRCUMFERENCE - length)}`,
        dashOffset: -offset,
      };
      offset += length;
      return segment;
    });
  }, [summary]);

  const hiddenByFilterCount = records.length - scopedRecords.length;

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
              {resolvedSettings.department.toUpperCase()} · {resolvedSettings.subgroup}-ша підгрупа
            </strong>
          </span>
          {onlyMyLessons && hiddenByFilterCount > 0 && (
            <span className="text-[11px] text-ink-muted">
              (приховано {hiddenByFilterCount} записів інших груп)
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
          <span>Лише мої пари (кафедра/підгрупа)</span>
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
        {/* Hero Summary Card */}
        <GlassCard variant="glass-strong" brackets padding="lg" className="lg:col-span-5">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
            <div className="flex min-w-0 max-w-full flex-col items-center gap-4 xs:flex-row sm:gap-5">
              {/* 132x132 SVG radial ring chart */}
              <div className="relative h-[132px] w-[132px] shrink-0">
                <svg
                  width={RING_SIZE}
                  height={RING_SIZE}
                  viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
                  className="block"
                  role="img"
                  aria-label={
                    summary.hasData && summary.percentage !== null
                      ? `Відвідуваність ${summary.percentage}%: був ${summary.present}, поважна ${summary.excused}, н-ка ${summary.absent}`
                      : 'Відміток відвідуваності за обраний період немає'
                  }
                >
                  <circle
                    cx={RING_CENTER}
                    cy={RING_CENTER}
                    r={RING_RADIUS}
                    fill="none"
                    stroke="var(--bg-surface-elevated)"
                    strokeWidth={RING_STROKE}
                  />
                  <g transform={`rotate(-90 ${RING_CENTER} ${RING_CENTER})`}>
                    {ringSegments.map((seg) => (
                      <circle
                        key={seg.key}
                        cx={RING_CENTER}
                        cy={RING_CENTER}
                        r={RING_RADIUS}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={RING_STROKE}
                        strokeLinecap={ringSegments.length === 1 ? 'round' : 'butt'}
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        style={
                          reduced
                            ? undefined
                            : {
                                transition:
                                  'stroke-dasharray 360ms cubic-bezier(0.22, 1, 0.36, 1), stroke-dashoffset 360ms cubic-bezier(0.22, 1, 0.36, 1)',
                              }
                        }
                      />
                    ))}
                  </g>
                </svg>

                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                  {summary.hasData && summary.percentage !== null ? (
                    <>
                      <AnimatedNumber
                        value={summary.percentage}
                        suffix="%"
                        animateOnMount
                        className="font-mono text-2xl font-bold tracking-tight text-ink"
                      />
                      <span className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-ink-secondary">
                        відвідано
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-2xl font-bold text-ink-muted">—</span>
                      <span className="mt-0.5 text-[10px] font-medium text-ink-muted">
                        немає даних
                      </span>
                    </>
                  )}
                </div>
              </div>

              <div className="w-full min-w-0 max-w-full flex-1 space-y-2 xs:w-auto">
                <div className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
                  <CalendarDots weight="regular" className="h-3.5 w-3.5 shrink-0 text-amber-fg" aria-hidden="true" />
                  <span>
                    {filterMode === 'month'
                      ? `${selectedMonthTitle} ${selectedYear}`
                      : 'Весь семестр'}
                  </span>
                </div>

                <p className="text-sm font-medium text-ink">
                  {summary.hasData
                    ? `Відмічено ${summary.totalMarked} пар (${summary.attended} зараховано)`
                    : 'Ще немає жодної відмітки за період'}
                </p>

                {/* Month-over-month delta badge */}
                {filterMode === 'month' && (
                  <div className="min-w-0 max-w-full">
                    {monthDelta.deltaPercent !== null ? (
                      <MetaChip
                        variant={
                          monthDelta.deltaPercent > 0
                            ? 'sage'
                            : monthDelta.deltaPercent < 0
                              ? 'terracotta'
                              : 'neutral'
                        }
                        mono
                        className="max-w-full whitespace-normal text-left"
                        icon={
                          monthDelta.deltaPercent > 0 ? (
                            <TrendUp weight="bold" className="h-3 w-3" />
                          ) : monthDelta.deltaPercent < 0 ? (
                            <TrendDown weight="bold" className="h-3 w-3" />
                          ) : (
                            <Minus weight="bold" className="h-3 w-3" />
                          )
                        }
                      >
                        {monthDelta.deltaPercent > 0
                          ? `+${monthDelta.deltaPercent}%`
                          : `${monthDelta.deltaPercent}%`}{' '}
                        до мин. місяця
                      </MetaChip>
                    ) : (
                      <MetaChip
                        variant="neutral"
                        className="max-w-full whitespace-normal text-left"
                      >
                        Порівняння з мин. місяцем недоступне
                      </MetaChip>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3 Stat Tiles */}
            <div className="grid grid-cols-3 gap-2.5 border-t border-line/70 pt-4 text-center">
              <div className="rounded-xl border border-sage/30 bg-sage-soft px-2 py-2.5">
                <span className="block font-mono text-lg font-bold tabular-nums text-sage-fg">
                  {summary.present}
                </span>
                <span className="text-[11px] font-medium text-ink-secondary">Був</span>
              </div>
              <div className="rounded-xl border border-terracotta/30 bg-terracotta-soft px-2 py-2.5">
                <span className="block font-mono text-lg font-bold tabular-nums text-terracotta-fg">
                  {summary.absent}
                </span>
                <span className="text-[11px] font-medium text-ink-secondary">Н-ка</span>
              </div>
              <div className="rounded-xl border border-amber/30 bg-amber-soft px-2 py-2.5">
                <span className="block font-mono text-lg font-bold tabular-nums text-amber-fg">
                  {summary.excused}
                </span>
                <span className="text-[11px] font-medium text-ink-secondary">Поважна</span>
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Interactive Goal Calculator */}
        <AttendanceCalculator
          attended={summary.attended}
          total={summary.totalMarked}
          goalPercent={goalPercent}
          onGoalChange={handleGoalChange}
          className="lg:col-span-7"
        />

        {/* Weekly SVG Trends */}
        <AttendanceTrends
          records={scopedRecords}
          goalPercent={goalPercent}
          maxWeeks={8}
          className="lg:col-span-12"
        />

        {/* Subject Breakdown */}
        <section aria-labelledby="subjects-breakdown-heading" className="space-y-4 lg:col-span-12">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="subjects-breakdown-heading"
              className="font-serif text-base font-semibold tracking-[-0.015em] text-ink"
            >
              {filterMode === 'month'
                ? `Предмети за ${selectedMonthTitle.toLowerCase()}`
                : 'Усі предмети за семестр'}
            </h3>
            {subjectStats.length > 0 && (
              <span className="font-mono text-xs tabular-nums text-ink-secondary">
                Дисциплін: {subjectStats.length}
              </span>
            )}
          </div>

          {subjectStats.length === 0 ? (
            <GlassCard variant="matte" padding="none">
              <EmptyState
                illustration={<EmptyAttendanceIllustration />}
                title="Відміток за цей період ще немає"
                description={
                  onlyMyLessons && hiddenByFilterCount > 0
                    ? 'У вибраному періоді немає записів для поточної кафедри/підгрупи. Спробуйте змінити місяць або вимкнути фільтр профілю.'
                    : 'Відмічайте статус кожної пари прямо у картці розкладу, щоб бачити статистику за предметами.'
                }
                showUnderline
                action={
                  onlyMyLessons && hiddenByFilterCount > 0
                    ? {
                        label: 'Показати всі пари',
                        onClick: () => setOnlyMyLessons(false),
                      }
                    : undefined
                }
              />
            </GlassCard>
          ) : (
            <StaggerList
              itemCount={subjectStats.length}
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
            >
              {subjectStats.map((stat) => {
                const pct = stat.percentage ?? 0;
                const badgeVariant = stat.target.isMeetingGoal
                  ? 'sage'
                  : !stat.target.isGoalReachable
                    ? 'amber'
                    : 'terracotta';

                const badgeLabel = stat.target.isMeetingGoal
                  ? `Запас: +${stat.target.canSkip}`
                  : !stat.target.isGoalReachable || stat.target.mustAttend === null
                    ? '100% недосяжна'
                    : `Потрібно: ${stat.target.mustAttend}`;

                return (
                  <StaggerCard key={stat.subjectName} interactive>
                    <GlassCard variant="matte" padding="md" className="flex h-full flex-col justify-between gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <h4 className="font-serif text-sm font-semibold leading-snug text-ink">
                          {stat.subjectName}
                        </h4>
                        <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-ink">
                          {stat.percentage !== null ? `${stat.percentage}%` : '—'}
                        </span>
                      </div>

                      <AnimatedProgressBar
                        value={pct}
                        label={`Відвідуваність з предмету ${stat.subjectName}`}
                        barClassName={getSubjectBarClass(stat)}
                        shimmer={false}
                      />

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-ink-secondary">
                        <div className="flex items-center gap-2 font-mono tabular-nums">
                          <span className="text-sage-fg">Був: {stat.present}</span>
                          <span>·</span>
                          <span className="text-amber-fg">Пов.: {stat.excused}</span>
                          <span>·</span>
                          <span className="text-terracotta-fg">Н-ка: {stat.absent}</span>
                        </div>

                        <MetaChip variant={badgeVariant} mono>
                          {badgeLabel}
                        </MetaChip>
                      </div>
                    </GlassCard>
                  </StaggerCard>
                );
              })}
            </StaggerList>
          )}
        </section>
      </div>
    </div>
  );
};
