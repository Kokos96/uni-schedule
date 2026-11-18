import React, { useMemo } from 'react';
import {
  CalendarDots,
  Minus,
  TrendDown,
  TrendUp,
} from '@phosphor-icons/react';
import { useAppReducedMotion } from '../../lib/motion';
import type { AttendanceSummary, computeMonthDelta } from '../../utils/attendanceMath';
import { AnimatedNumber } from '../motion/MotionPrimitives';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';

const RING_SIZE = 132;
const RING_CENTER = RING_SIZE / 2;
const RING_RADIUS = 52;
const RING_STROKE = 11;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export interface AttendanceRingCardProps {
  summary: AttendanceSummary;
  monthDelta: ReturnType<typeof computeMonthDelta>;
  filterMode: 'month' | 'all';
  periodLabel: string;
}

export const AttendanceRingCard: React.FC<AttendanceRingCardProps> = ({
  summary,
  monthDelta,
  filterMode,
  periodLabel,
}) => {
  const reduced = useAppReducedMotion();

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

  return (
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
              <span>{periodLabel}</span>
            </div>

            <p className="text-sm font-medium text-ink">
              {summary.hasData
                ? `Відмічено ${summary.totalMarked} пар (${summary.attended} зараховано)`
                : 'Ще немає жодної відмітки за період'}
            </p>

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
  );
};
