import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowCounterClockwise, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { cn } from '../../utils/cn';
import {
  MOTION_SPRINGS,
  resolveTransition,
  useAppReducedMotion,
} from '../../lib/motion';
import {
  DAY_NAMES_UA_FULL,
  DAY_NAMES_UA_SHORT,
  MONTH_NAMES_UA_GENITIVE,
  formatIsoDate,
  getScheduleDayNumber,
  isSameDay,
} from '../../utils/date';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';

export interface WeekStripProps {
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onShiftWeek: (deltaWeeks: number) => void;
  onResetToday: () => void;
  weekDates: Date[];
  weekParity: 'numerator' | 'denominator';
  hasLessonsOnDate?: (date: Date) => boolean;
}

const SWIPE_THRESHOLD_PX = 48;

export const WeekStrip: React.FC<WeekStripProps> = ({
  selectedDate,
  onSelectDate,
  onShiftWeek,
  onResetToday,
  weekDates,
  weekParity,
  hasLessonsOnDate,
}) => {
  const reducedMotion = useAppReducedMotion();
  const dayTransition = resolveTransition(MOTION_SPRINGS.tactile, reducedMotion);
  const touchOriginRef = useRef<{ x: number; y: number } | null>(null);

  const today = new Date();
  const isOnToday = isSameDay(selectedDate, today);
  const isNumerator = weekParity === 'numerator';

  const formattedDate = `${selectedDate.getDate()} ${MONTH_NAMES_UA_GENITIVE[selectedDate.getMonth()]}, ${selectedDate.getFullYear()}`;
  const selectedDayName =
    DAY_NAMES_UA_FULL[getScheduleDayNumber(selectedDate)] ?? '';

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    touchOriginRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const origin = touchOriginRef.current;
    touchOriginRef.current = null;
    const touch = event.changedTouches[0];
    if (!origin || !touch) return;

    const dx = touch.clientX - origin.x;
    const dy = touch.clientY - origin.y;

    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.4) {
      onShiftWeek(dx < 0 ? 1 : -1);
    }
  };

  return (
    <GlassCard
      variant="glass"
      padding="sm"
      className="space-y-2.5 overflow-hidden"
    >
      {/* Header Row 1: Formatted Selected Date + Today Action */}
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate font-serif text-[15px] xs:text-base font-semibold tracking-tight text-ink">
            {formattedDate}
          </h2>
          {selectedDayName && (
            <p className="truncate text-[11px] font-medium text-ink-secondary">
              {selectedDayName}
            </p>
          )}
        </div>

        {isOnToday ? (
          <span
            aria-current="date"
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl border border-line bg-surface-elevated/70 px-2.5 text-[11px] font-medium text-ink-secondary select-none"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-amber" aria-hidden />
            <span>Сьогодні</span>
          </span>
        ) : (
          <button
            type="button"
            onClick={onResetToday}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl border border-amber/35 bg-amber-soft px-2.5 text-xs font-semibold text-amber-fg transition-colors hover:bg-amber/20 active:opacity-85"
          >
            <ArrowCounterClockwise className="h-3.5 w-3.5 shrink-0" weight="regular" aria-hidden />
            <span>Сьогодні</span>
          </button>
        )}
      </div>

      {/* Header Row 2: Week Parity Pill + Week Navigation Arrows */}
      <div className="flex items-center justify-between gap-2">
        <MetaChip
          variant={isNumerator ? 'amber' : 'sage'}
          mono
          className="px-2.5 py-1"
        >
          {isNumerator ? 'Чисельник ▲' : 'Знаменник ▼'}
        </MetaChip>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onShiftWeek(-1)}
            aria-label="Попередній тиждень"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-line bg-surface-elevated/70 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
          >
            <CaretLeft className="h-4 w-4" weight="bold" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onShiftWeek(1)}
            aria-label="Наступний тиждень"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-line bg-surface-elevated/70 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
          >
            <CaretRight className="h-4 w-4" weight="bold" aria-hidden />
          </button>
        </div>
      </div>

      {/* Interactive Day Strip */}
      <div
        data-weekstrip-row="true"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className="grid touch-pan-y gap-1 xs:gap-1.5"
        style={{
          gridTemplateColumns: `repeat(${Math.max(weekDates.length, 1)}, minmax(0, 1fr))`,
        }}
        role="group"
        aria-label="Дні тижня"
      >
        {weekDates.map((date) => {
          const iso = formatIsoDate(date);
          const dayNum = getScheduleDayNumber(date);
          const shortName = DAY_NAMES_UA_SHORT[dayNum] ?? '';
          const fullName = DAY_NAMES_UA_FULL[dayNum] ?? shortName;
          const isSelected = isSameDay(date, selectedDate);
          const isToday = isSameDay(date, today);
          const hasLessons = hasLessonsOnDate ? hasLessonsOnDate(date) : false;

          return (
            <button
              key={iso}
              data-weekstrip-iso={iso}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-current={isSelected ? 'date' : undefined}
              aria-label={`${fullName}, ${date.getDate()} ${MONTH_NAMES_UA_GENITIVE[date.getMonth()]}, ${date.getFullYear()}${isToday ? ' (Сьогодні)' : ''}`}
              className={cn(
                'relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1.5 transition-colors select-none',
                isSelected
                  ? 'text-ink'
                  : 'text-ink-secondary hover:bg-surface-elevated/55 hover:text-ink'
              )}
            >
              {isSelected && (
                <motion.span
                  layoutId="activeWeekDay"
                  transition={dayTransition}
                  aria-hidden
                  className="glass-amber-lit pointer-events-none absolute inset-0 rounded-xl"
                />
              )}

              <span
                className={cn(
                  'relative z-10 text-[10px] font-medium uppercase leading-none tracking-[0.03em]',
                  isSelected ? 'text-amber-fg' : 'text-ink-secondary'
                )}
              >
                {shortName}
              </span>

              <span
                className={cn(
                  'relative z-10 font-mono text-[13px] xs:text-sm font-semibold tabular-nums leading-none',
                  isSelected || isToday ? 'text-ink' : 'text-ink-secondary'
                )}
              >
                {date.getDate()}
              </span>

              <span
                className="relative z-10 flex h-1.5 items-center justify-center gap-1"
                aria-hidden
              >
                {isToday && (
                  <span
                    className={cn(
                      'h-1.5 w-1.5 rounded-full',
                      isSelected ? 'bg-amber-fg' : 'bg-amber'
                    )}
                  />
                )}
                {hasLessons && (
                  <span
                    className={cn(
                      'h-1 w-1 rounded-full',
                      isSelected ? 'bg-ink/60' : 'bg-sage'
                    )}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
};
