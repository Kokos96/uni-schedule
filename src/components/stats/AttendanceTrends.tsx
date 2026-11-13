import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';
import { AttendanceRecord } from '../../types';
import { computeWeeklyTrends, WeeklyTrendPoint } from '../../utils/attendanceMath';
import { MOTION_DURATIONS, MOTION_EASE, useAppReducedMotion } from '../../lib/motion';
import { GlassCard } from '../ui/GlassCard';

export interface AttendanceTrendsProps {
  records: readonly AttendanceRecord[];
  goalPercent: number;
  maxWeeks?: number;
  className?: string;
}

const SVG_WIDTH = 560;
const SVG_HEIGHT = 216;
const PAD_LEFT = 42;
const PAD_RIGHT = 20;
const PAD_TOP = 18;
const PAD_BOTTOM = 34;
const PLOT_WIDTH = SVG_WIDTH - PAD_LEFT - PAD_RIGHT;
const PLOT_HEIGHT = SVG_HEIGHT - PAD_TOP - PAD_BOTTOM;

function percentToY(percent: number): number {
  const clamped = Math.max(0, Math.min(100, percent));
  return PAD_TOP + PLOT_HEIGHT * (1 - clamped / 100);
}

function getBarColorToken(percentage: number | null, goalPercent: number): string {
  if (percentage === null) return 'var(--text-muted)';
  if (percentage >= goalPercent) return 'var(--chart-sage)';
  if (percentage >= Math.max(50, goalPercent - 15)) return 'var(--chart-amber)';
  return 'var(--chart-terracotta)';
}

export const AttendanceTrends: React.FC<AttendanceTrendsProps> = ({
  records,
  goalPercent,
  maxWeeks = 8,
  className,
}) => {
  const reduced = useAppReducedMotion();
  const clampedGoal = Math.min(100, Math.max(50, Math.round(goalPercent)));
  const points = useMemo(() => computeWeeklyTrends(records, maxWeeks), [records, maxWeeks]);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const safeActiveIndex =
    activeIndex !== null && activeIndex >= 0 && activeIndex < points.length ? activeIndex : null;
  const activePoint: WeeklyTrendPoint | null =
    safeActiveIndex !== null ? points[safeActiveIndex] : null;

  const goalY = percentToY(clampedGoal);
  const gridTicks = [100, 50, 0] as const;

  const slotWidth = points.length > 0 ? PLOT_WIDTH / points.length : PLOT_WIDTH;
  const barWidth = Math.min(42, Math.max(18, slotWidth * 0.56));
  const barRefs = React.useRef<Array<SVGGElement | null>>([]);

  return (
    <GlassCard variant="glass" padding="lg" className={className}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface-elevated text-amber-fg">
            <BarChart3 className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink">
              Тижнева динаміка
            </h3>
            <p className="text-xs text-ink-secondary">
              Останні активні тижні (до {maxWeeks}) відносно цілі {clampedGoal}%
            </p>
          </div>
        </div>

        {/* Color legend */}
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-ink-secondary">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-sage" aria-hidden="true" />
            <span>≥ {clampedGoal}%</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber" aria-hidden="true" />
            <span>Близько</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-terracotta" aria-hidden="true" />
            <span>Нижче</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block w-3.5 border-t-[1.5px] border-dashed border-amber"
              aria-hidden="true"
            />
            <span>Ціль</span>
          </span>
        </div>
      </div>

      {points.length === 0 ? (
        <div className="mt-4 flex min-h-[150px] items-center justify-center rounded-xl border border-dashed border-line bg-surface-elevated/35 px-4 text-center">
          <p className="text-xs text-ink-secondary">
            Щоб побачити тижневий графік, відмітьте відвідуваність у розкладі.
          </p>
        </div>
      ) : (
        <div
          className="relative mt-4"
          onMouseLeave={() => setActiveIndex(null)}
        >
          {/* Floating interactive tooltip */}
          {activePoint && safeActiveIndex !== null && (
            <div
              role="status"
              aria-live="polite"
              style={{
                left: `clamp(96px, ${((PAD_LEFT + slotWidth * (safeActiveIndex + 0.5)) / SVG_WIDTH) * 100}%, calc(100% - 96px))`,
              }}
              className="glass-strong pointer-events-none absolute -top-2 z-20 -translate-x-1/2 -translate-y-full rounded-xl border border-line-strong/60 px-3 py-2 text-xs shadow-glass"
            >
              <div className="flex items-center justify-between gap-3 whitespace-nowrap">
                <span className="font-mono font-medium text-ink-secondary">
                  {activePoint.rangeLabel}
                </span>
                <span className="font-mono font-bold tabular-nums text-ink">
                  {activePoint.attended}/{activePoint.totalMarked} ({activePoint.percentage ?? 0}%)
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap text-[10px] text-ink-secondary">
                <span>Був: {activePoint.present}</span>
                <span>·</span>
                <span>Поваж.: {activePoint.excused}</span>
                <span>·</span>
                <span>Н-ка: {activePoint.absent}</span>
              </div>
            </div>
          )}

          <svg
            viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
            className="h-52 w-full overflow-visible select-none"
            aria-label={`Стовпчикова діаграма відвідуваності за останні ${points.length} активних тижнів`}
          >
            {/* Horizontal grid lines and Y-axis ticks */}
            {gridTicks.map((tick) => {
              const y = percentToY(tick);
              return (
                <g key={tick}>
                  <line
                    x1={PAD_LEFT}
                    y1={y}
                    x2={SVG_WIDTH - PAD_RIGHT}
                    y2={y}
                    stroke="var(--border-subtle)"
                    strokeOpacity={tick === 0 ? 0.85 : 0.45}
                    strokeWidth={1}
                  />
                  <text
                    x={PAD_LEFT - 8}
                    y={y + 3.5}
                    textAnchor="end"
                    fill="var(--text-secondary)"
                    fontSize={10}
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                  >
                    {tick}%
                  </text>
                </g>
              );
            })}

            {/* Bars */}
            {points.map((point, index) => {
              const pct = point.percentage ?? 0;
              const centerX = PAD_LEFT + slotWidth * (index + 0.5);
              const barX = centerX - barWidth / 2;
              const barTopY = percentToY(pct);
              const barHeight = Math.max(pct > 0 ? 4 : 0, PAD_TOP + PLOT_HEIGHT - barTopY);
              const isActive = safeActiveIndex === index;
              const fillColor = getBarColorToken(point.percentage, clampedGoal);

              return (
                <g
                  key={point.weekStartIso}
                  ref={(el) => {
                    barRefs.current[index] = el;
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Тиждень ${point.rangeLabel}: ${point.attended} з ${point.totalMarked} пар (${pct}%)`}
                  aria-pressed={isActive}
                  onMouseEnter={() => setActiveIndex(index)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex((prev) => (prev === index ? null : prev))}
                  onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setActiveIndex(null);
                    } else if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      const nextIdx = (index + 1) % points.length;
                      setActiveIndex(nextIdx);
                      barRefs.current[nextIdx]?.focus();
                    } else if (e.key === 'ArrowLeft') {
                      e.preventDefault();
                      const prevIdx = (index - 1 + points.length) % points.length;
                      setActiveIndex(prevIdx);
                      barRefs.current[prevIdx]?.focus();
                    } else if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveIndex((prev) => (prev === index ? null : index));
                    }
                  }}
                  className="cursor-pointer outline-none"
                >
                  {/* Full-column invisible hit target for easy touch/hover */}
                  <rect
                    x={PAD_LEFT + slotWidth * index}
                    y={PAD_TOP}
                    width={slotWidth}
                    height={PLOT_HEIGHT + PAD_BOTTOM - 4}
                    fill="transparent"
                  />

                  {/* Subtle column track */}
                  <rect
                    x={barX}
                    y={PAD_TOP}
                    width={barWidth}
                    height={PLOT_HEIGHT}
                    rx={6}
                    fill="var(--bg-surface-elevated)"
                    fillOpacity={isActive ? 0.9 : 0.45}
                  />

                  {/* Active highlight outline */}
                  {isActive && (
                    <rect
                      x={barX - 2}
                      y={PAD_TOP - 2}
                      width={barWidth + 4}
                      height={PLOT_HEIGHT + 4}
                      rx={8}
                      fill="none"
                      stroke="var(--accent-amber)"
                      strokeOpacity={0.75}
                      strokeWidth={1.5}
                    />
                  )}

                  {/* Data bar */}
                  {barHeight > 0 && (
                    <motion.rect
                      x={barX}
                      y={barTopY}
                      width={barWidth}
                      height={barHeight}
                      rx={6}
                      fill={fillColor}
                      fillOpacity={isActive ? 1 : 0.88}
                      initial={reduced ? false : { scaleY: 0 }}
                      animate={{ scaleY: 1 }}
                      transition={
                        reduced
                          ? { duration: 0.12 }
                          : {
                              duration: MOTION_DURATIONS.slow,
                              delay: index * 0.03,
                              ease: MOTION_EASE.editorial,
                            }
                      }
                      style={{ transformBox: 'fill-box', transformOrigin: 'bottom' }}
                    />
                  )}

                  {/* Percentage label above bar on hover/focus or compact readout */}
                  <text
                    x={centerX}
                    y={Math.max(PAD_TOP + 10, barTopY - 5)}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fillOpacity={isActive ? 1 : 0.72}
                    fontSize={10}
                    fontWeight={isActive ? 700 : 500}
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                  >
                    {pct}%
                  </text>

                  {/* Week start date X-axis label */}
                  <text
                    x={centerX}
                    y={SVG_HEIGHT - 12}
                    textAnchor="middle"
                    fill={isActive ? 'var(--text-primary)' : 'var(--text-secondary)'}
                    fontWeight={isActive ? 600 : 400}
                    fontSize={10.5}
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                  >
                    {point.label}
                  </text>
                </g>
              );
            })}

            {/* Dashed goal threshold line rendered on top for clarity */}
            <line
              x1={PAD_LEFT}
              y1={goalY}
              x2={SVG_WIDTH - PAD_RIGHT}
              y2={goalY}
              stroke="var(--accent-amber)"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              pointerEvents="none"
            />
            <g pointerEvents="none">
              <rect
                x={SVG_WIDTH - PAD_RIGHT - 36}
                y={Math.max(2, goalY - 17)}
                width={36}
                height={15}
                rx={4}
                fill="var(--bg-surface)"
                stroke="var(--accent-amber)"
                strokeOpacity={0.55}
                strokeWidth={1}
              />
              <text
                x={SVG_WIDTH - PAD_RIGHT - 18}
                y={Math.max(12.5, goalY - 6.5)}
                textAnchor="middle"
                fill="var(--accent-amber-fg)"
                fontSize={9.5}
                fontWeight={600}
                fontFamily="JetBrains Mono, ui-monospace, monospace"
              >
                {clampedGoal}%
              </text>
            </g>
          </svg>

          {/* Accessible fallback readout bar for touch / screen-reader clarity */}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-secondary">
            {activePoint ? (
              <span>
                Обрано:{' '}
                <strong className="font-medium text-ink">{activePoint.rangeLabel}</strong> —{' '}
                <span className="font-mono tabular-nums text-ink">
                  {activePoint.attended}/{activePoint.totalMarked} ({activePoint.percentage ?? 0}%)
                </span>
              </span>
            ) : (
              <span>Наведіть або натисніть на стовпець, щоб переглянути деталі тижня</span>
            )}
            <span className="font-mono tabular-nums text-ink-muted">
              Тижнів: {points.length}
            </span>
          </div>
        </div>
      )}
    </GlassCard>
  );
};
