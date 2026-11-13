import React from 'react';
import { BookOpen, FlaskConical, PenLine, type LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LessonType } from '../../types';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface LessonTypeBadgeProps {
  type: LessonType;
  compact?: boolean;
  className?: string;
}

const LESSON_TYPE_CONFIG: Record<
  LessonType,
  {
    shortLabel: string;
    Icon: LucideIcon;
    style: React.CSSProperties;
  }
> = {
  'Лекція': {
    shortLabel: 'Лек',
    Icon: BookOpen,
    style: {
      backgroundColor: 'var(--badge-lecture-bg)',
      borderColor: 'var(--badge-lecture-border)',
      color: 'var(--badge-lecture-fg)',
    },
  },
  'Практична': {
    shortLabel: 'Практ',
    Icon: PenLine,
    style: {
      backgroundColor: 'var(--badge-practice-bg)',
      borderColor: 'var(--badge-practice-border)',
      color: 'var(--badge-practice-fg)',
    },
  },
  'Лабораторна': {
    shortLabel: 'Лаб',
    Icon: FlaskConical,
    style: {
      backgroundColor: 'var(--badge-lab-bg)',
      borderColor: 'var(--badge-lab-border)',
      color: 'var(--badge-lab-fg)',
    },
  },
};

export const LessonTypeBadge: React.FC<LessonTypeBadgeProps> = ({
  type,
  compact = false,
  className,
}) => {
  const config = LESSON_TYPE_CONFIG[type];
  const { Icon } = config;

  return (
    <span
      style={config.style}
      className={cn(
        'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium leading-tight whitespace-nowrap select-none',
        className
      )}
    >
      <Icon className="h-3 w-3 shrink-0" aria-hidden />
      <span>{compact ? config.shortLabel : type}</span>
    </span>
  );
};

export type MetaChipVariant = 'neutral' | 'amber' | 'terracotta' | 'sage' | 'beige';

export interface MetaChipProps {
  children: React.ReactNode;
  variant?: MetaChipVariant;
  mono?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

const META_VARIANT_CLASSES: Record<MetaChipVariant, string> = {
  neutral: 'bg-surface-elevated border-line text-ink-secondary',
  amber: 'bg-amber-soft border-amber/30 text-amber-fg',
  terracotta: 'bg-terracotta-soft border-terracotta/30 text-terracotta-fg',
  sage: 'bg-sage-soft border-sage/35 text-sage-fg',
  beige: 'bg-beige-soft border-beige/30 text-beige-fg',
};

export const MetaChip: React.FC<MetaChipProps> = ({
  children,
  variant = 'neutral',
  mono = false,
  icon,
  className,
}) => {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-left text-[11px] font-medium leading-tight whitespace-normal sm:whitespace-nowrap',
        META_VARIANT_CLASSES[variant],
        mono && 'font-mono tabular-nums tracking-[0.02em]',
        className
      )}
    >
      {icon && <span className="shrink-0" aria-hidden>{icon}</span>}
      <span className="min-w-0">{children}</span>
    </span>
  );
};

export type StatusDotTone = 'amber' | 'sage' | 'terracotta' | 'neutral';

export interface StatusDotProps {
  tone?: StatusDotTone;
  pulse?: boolean;
  size?: 'sm' | 'md';
  label?: string;
  className?: string;
}

const DOT_TONE_CLASSES: Record<StatusDotTone, string> = {
  amber: 'bg-amber',
  sage: 'bg-sage',
  terracotta: 'bg-terracotta',
  neutral: 'bg-ink-muted',
};

const HALO_TONE_CLASSES: Record<StatusDotTone, string> = {
  amber: 'bg-amber/35',
  sage: 'bg-sage/35',
  terracotta: 'bg-terracotta/35',
  neutral: 'bg-ink-muted/25',
};

export const StatusDot: React.FC<StatusDotProps> = ({
  tone = 'amber',
  pulse = false,
  size = 'sm',
  label,
  className,
}) => {
  const sizeClass = size === 'md' ? 'h-2 w-2' : 'h-1.5 w-1.5';

  return (
    <span
      className={cn('relative inline-flex items-center justify-center shrink-0', sizeClass, className)}
      aria-label={label}
      role={label ? 'img' : undefined}
      aria-hidden={label ? undefined : true}
    >
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full scale-[2.1] rounded-full animate-ping opacity-75',
            HALO_TONE_CLASSES[tone]
          )}
        />
      )}
      <span className={cn('relative inline-flex rounded-full', sizeClass, DOT_TONE_CLASSES[tone])} />
    </span>
  );
};
