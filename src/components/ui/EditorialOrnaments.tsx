import React from 'react';
import { cn } from '../../utils/cn';

export interface EditorialUnderlineProps {
  width?: number;
  className?: string;
}

/**
 * Drafted asymmetric fountain-pen underline placed beneath active headings or hero stats.
 */
export const EditorialUnderline: React.FC<EditorialUnderlineProps> = ({
  width = 96,
  className,
}) => (
  <svg
    aria-hidden="true"
    width={width}
    height={6}
    viewBox="0 0 120 6"
    fill="none"
    preserveAspectRatio="none"
    className={cn('block shrink-0 select-none', className)}
  >
    <path
      d="M 1 4 Q 32 1, 68 3 T 118 2"
      stroke="var(--accent-amber)"
      strokeOpacity={0.55}
      strokeWidth={1.35}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

export interface CornerBracketsProps {
  size?: number;
  insetClassName?: string;
  className?: string;
}

/**
 * Hairline architectural registration L-ticks anchored to top-left and bottom-right corners.
 * Parent container should have `position: relative`.
 */
export const CornerBrackets: React.FC<CornerBracketsProps> = ({
  size = 8,
  insetClassName,
  className,
}) => {
  const tlClass = insetClassName ?? 'top-2 left-2';
  const brClass = insetClassName ?? 'bottom-2 right-2';

  return (
    <span aria-hidden="true" className={cn('pointer-events-none select-none', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        fill="none"
        className={cn('absolute', tlClass)}
      >
        <path
          d="M 0.75 7.25 V 0.75 H 7.25"
          stroke="var(--accent-amber)"
          strokeOpacity={0.45}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <svg
        width={size}
        height={size}
        viewBox="0 0 8 8"
        fill="none"
        className={cn('absolute', brClass)}
      >
        <path
          d="M 7.25 0.75 V 7.25 H 0.75"
          stroke="var(--accent-amber)"
          strokeOpacity={0.45}
          strokeWidth={1.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </span>
  );
};

export interface SectionRuleProps {
  align?: 'center' | 'left';
  className?: string;
}

/**
 * Thin 1px structural divider interrupted by a 4px Warm Amber rotated diamond.
 */
export const SectionRule: React.FC<SectionRuleProps> = ({
  align = 'center',
  className,
}) => (
  <div
    aria-hidden="true"
    className={cn('flex items-center gap-2.5 w-full select-none', className)}
  >
    {align === 'center' && (
      <span className="h-px flex-1 bg-line" />
    )}
    <svg
      width={7}
      height={7}
      viewBox="0 0 8 8"
      fill="none"
      className="shrink-0"
    >
      <rect
        x="4"
        y="1.2"
        width="4"
        height="4"
        transform="rotate(45 4 1.2)"
        fill="var(--accent-amber)"
        fillOpacity={0.85}
      />
    </svg>
    <span className="h-px flex-1 bg-line" />
  </div>
);

export interface IllustrationProps {
  size?: number;
  className?: string;
}

/**
 * Weekend empty state ("Вихідний день"): minimalist crescent arc + resting fountain pen over closed notebook.
 */
export const WeekendIllustration: React.FC<IllustrationProps> = ({
  size = 76,
  className,
}) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    className={cn('shrink-0 select-none', className)}
  >
    {/* Soft background wash */}
    <circle
      cx="40"
      cy="40"
      r="28"
      fill="var(--accent-beige)"
      fillOpacity={0.08}
    />
    {/* Closed notebook contour */}
    <rect
      x="18"
      y="34"
      width="44"
      height="30"
      rx="3"
      stroke="var(--text-secondary)"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Notebook spine */}
    <line
      x1="25"
      y1="34"
      x2="25"
      y2="64"
      stroke="var(--text-secondary)"
      strokeWidth={1.25}
      strokeOpacity={0.65}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Resting fountain pen */}
    <path
      d="M 33 49 L 54 28 L 58 32 L 37 53 L 31 55 Z"
      stroke="var(--text-secondary)"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <line
      x1="34.5"
      y1="51.5"
      x2="37"
      y2="49"
      stroke="var(--accent-amber)"
      strokeWidth={1.4}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Minimalist crescent moon accent */}
    <path
      d="M 30 16 A 8.5 8.5 0 1 0 39 26 A 6.8 6.8 0 1 1 30 16 Z"
      stroke="var(--accent-amber)"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

/**
 * Weekday with no lessons ("Пар немає"): open architectural bookmark ribbon + faint horizon line.
 */
export const FreeDayIllustration: React.FC<IllustrationProps> = ({
  size = 76,
  className,
}) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    className={cn('shrink-0 select-none', className)}
  >
    <circle
      cx="40"
      cy="39"
      r="27"
      fill="var(--accent-amber)"
      fillOpacity={0.08}
    />
    {/* Horizon rule */}
    <line
      x1="14"
      y1="57"
      x2="66"
      y2="57"
      stroke="var(--text-secondary)"
      strokeOpacity={0.5}
      strokeWidth={1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Open architectural pages */}
    <path
      d="M 18 26 C 26 24, 34 25, 40 29 C 46 25, 54 24, 62 26 V 52 C 54 50, 46 51, 40 54 C 34 51, 26 50, 18 52 Z"
      stroke="var(--text-secondary)"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <line
      x1="40"
      y1="29"
      x2="40"
      y2="54"
      stroke="var(--text-secondary)"
      strokeOpacity={0.6}
      strokeWidth={1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Amber bookmark ribbon */}
    <path
      d="M 48 25 V 44 L 51.5 40.5 L 55 44 V 25"
      stroke="var(--accent-amber)"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);

/**
 * No attendance records ("Відміток ще немає"): clean 5x3 dot-matrix grid with one amber circled cell.
 */
export const EmptyAttendanceIllustration: React.FC<IllustrationProps> = ({
  size = 76,
  className,
}) => {
  const cols = [22, 31, 40, 49, 58];
  const rows = [29, 40, 51];

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      className={cn('shrink-0 select-none', className)}
    >
      <rect
        x="13"
        y="19"
        width="54"
        height="42"
        rx="6"
        fill="var(--accent-beige)"
        fillOpacity={0.08}
        stroke="var(--text-secondary)"
        strokeOpacity={0.45}
        strokeWidth={1.25}
        vectorEffect="non-scaling-stroke"
      />
      {rows.map((y, rIdx) =>
        cols.map((x, cIdx) => {
          const isFocal = rIdx === 1 && cIdx === 3;
          return (
            <circle
              key={`${rIdx}-${cIdx}`}
              cx={x}
              cy={y}
              r={isFocal ? 2.1 : 1.5}
              fill={isFocal ? 'var(--accent-amber)' : 'var(--text-secondary)'}
              fillOpacity={isFocal ? 0.95 : 0.65}
            />
          );
        })
      )}
      {/* Amber circled cell */}
      <circle
        cx={49}
        cy={40}
        r={5.5}
        stroke="var(--accent-amber)"
        strokeWidth={1.4}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

/**
 * No notes / deadlines ("Нотаток та дедлайнів немає"): ruled card + tilted pencil nib + amber spark dot.
 */
export const EmptyNotesIllustration: React.FC<IllustrationProps> = ({
  size = 76,
  className,
}) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 80 80"
    fill="none"
    className={cn('shrink-0 select-none', className)}
  >
    <circle
      cx="40"
      cy="40"
      r="28"
      fill="var(--accent-amber)"
      fillOpacity={0.08}
    />
    {/* Geometric ruled card */}
    <rect
      x="18"
      y="20"
      width="38"
      height="44"
      rx="4"
      stroke="var(--text-secondary)"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    <line
      x1="25"
      y1="31"
      x2="45"
      y2="31"
      stroke="var(--text-secondary)"
      strokeOpacity={0.6}
      strokeWidth={1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    <line
      x1="25"
      y1="39"
      x2="42"
      y2="39"
      stroke="var(--text-secondary)"
      strokeOpacity={0.6}
      strokeWidth={1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    <line
      x1="25"
      y1="47"
      x2="36"
      y2="47"
      stroke="var(--text-secondary)"
      strokeOpacity={0.45}
      strokeWidth={1.25}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Tilted pencil nib */}
    <path
      d="M 45 52 L 61 36 L 65 40 L 49 56 L 43 58 Z"
      fill="var(--bg-canvas)"
      stroke="var(--text-secondary)"
      strokeWidth={1.3}
      strokeLinecap="round"
      strokeLinejoin="round"
      vectorEffect="non-scaling-stroke"
    />
    {/* Amber spark dot */}
    <circle
      cx="60"
      cy="24"
      r="2.2"
      fill="var(--accent-amber)"
    />
    <path
      d="M 60 18.5 V 20.2 M 60 27.8 V 29.5 M 54.5 24 H 56.2 M 63.8 24 H 65.5"
      stroke="var(--accent-amber)"
      strokeWidth={1.3}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
    />
  </svg>
);
