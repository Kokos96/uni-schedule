import React, { Suspense, lazy } from 'react';
import {
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
} from '@phosphor-icons/react';
import type { AttendanceStatus, Classroom, Lesson, Teacher, WeekParity } from '../../types';
import { formatIsoDate, formatShortDateUa } from '../../utils/date';
import type { WeekGridData } from '../../utils/schedule';
import { GlassCard } from '../ui/GlassCard';

const WeekGrid = lazy(() =>
  import('./WeekGrid').then((m) => ({
    default: m.WeekGrid,
  }))
);

export interface WeekGridSectionProps {
  weekDates: readonly Date[];
  weekGrid: WeekGridData;
  teachersMap: Map<string, Teacher>;
  classroomsMap: Map<string, Classroom>;
  weekParity: WeekParity;
  selectedIso: string;
  todayIso: string;
  isToday: boolean;
  currentLessonId?: string;
  onShiftWeek: (deltaWeeks: number) => void;
  onResetToToday: () => void;
  onSelectDate: (dateIso: string) => void;
  getAttendanceStatus: (lessonId: string, dateIso: string) => AttendanceStatus | null;
  onToggleAttendance: (lessonId: string, dateIso: string, status: AttendanceStatus) => void;
  getNoteCountForLesson: (lessonId: string, dateIso: string) => number;
  onOpenNotes: (lesson: Lesson, dateIso: string) => void;
}

export const WeekGridSection: React.FC<WeekGridSectionProps> = ({
  weekDates,
  weekGrid,
  teachersMap,
  classroomsMap,
  weekParity,
  selectedIso,
  todayIso,
  isToday,
  currentLessonId,
  onShiftWeek,
  onResetToToday,
  onSelectDate,
  getAttendanceStatus,
  onToggleAttendance,
  getNoteCountForLesson,
  onOpenNotes,
}) => {
  const weekStartDate = weekDates[0];
  const weekEndDate = weekDates[weekDates.length - 1];
  const weekRangeLabel =
    weekStartDate && weekEndDate
      ? `${formatShortDateUa(formatIsoDate(weekStartDate))} – ${formatShortDateUa(formatIsoDate(weekEndDate))}`
      : '';

  return (
    <div className="space-y-3">
      <GlassCard
        variant="glass"
        padding="sm"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onShiftWeek(-1)}
            aria-label="Попередній тиждень"
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated/70 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
          >
            <CaretLeft className="h-4 w-4" weight="bold" aria-hidden="true" />
          </button>
          <span className="font-mono text-xs font-semibold tabular-nums text-ink">
            {weekRangeLabel}
          </span>
          <button
            type="button"
            onClick={() => onShiftWeek(1)}
            aria-label="Наступний тиждень"
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated/70 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
          >
            <CaretRight className="h-4 w-4" weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-line bg-surface-elevated/70 px-2.5 py-1 font-mono text-[11px] font-medium text-ink-secondary">
            {weekParity === 'numerator' ? 'Чисельник ▲' : 'Знаменник ▼'}
          </span>
          {!isToday && (
            <button
              type="button"
              onClick={onResetToToday}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber/35 bg-amber-soft px-2.5 text-xs font-semibold text-amber-fg transition-colors hover:bg-amber/20 active:scale-[0.97]"
            >
              <ArrowCounterClockwise className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
              <span>Поточний тиждень</span>
            </button>
          )}
        </div>
      </GlassCard>

      <Suspense
        fallback={
          <GlassCard
            variant="matte"
            padding="lg"
            className="space-y-3"
            aria-busy="true"
            aria-label="Завантаження тижневої сітки"
          >
            <div className="h-5 w-44 rounded-lg bg-surface-elevated/80 animate-pulse" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="h-40 rounded-xl bg-surface-elevated/60 animate-pulse" />
              <div className="h-40 rounded-xl bg-surface-elevated/60 animate-pulse" />
              <div className="hidden h-40 rounded-xl bg-surface-elevated/50 animate-pulse sm:block" />
              <div className="hidden h-40 rounded-xl bg-surface-elevated/50 animate-pulse lg:block" />
              <div className="hidden h-40 rounded-xl bg-surface-elevated/50 animate-pulse lg:block" />
            </div>
          </GlassCard>
        }
      >
        <WeekGrid
          weekGrid={weekGrid}
          teachersMap={teachersMap}
          classroomsMap={classroomsMap}
          selectedIso={selectedIso}
          todayIso={todayIso}
          currentLessonId={currentLessonId}
          getAttendanceStatus={getAttendanceStatus}
          onToggleAttendance={onToggleAttendance}
          getNoteCountForLesson={getNoteCountForLesson}
          onOpenNotes={onOpenNotes}
          onSelectDate={onSelectDate}
        />
      </Suspense>
    </div>
  );
};
