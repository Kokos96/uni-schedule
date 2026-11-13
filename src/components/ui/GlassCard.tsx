import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CornerBrackets } from './EditorialOrnaments';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type GlassCardVariant = 'matte' | 'glass' | 'glass-strong' | 'amber-lit';

export interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: GlassCardVariant;
  brackets?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  interactive?: boolean;
}

const VARIANT_CLASSES: Record<GlassCardVariant, string> = {
  matte: 'bg-surface border border-line',
  glass: 'glass-panel',
  'glass-strong': 'glass-strong',
  'amber-lit': 'glass-amber-lit',
};

const PADDING_CLASSES: Record<NonNullable<GlassCardProps['padding']>, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-5',
};

export const GlassCard = React.forwardRef<HTMLDivElement, GlassCardProps>(
  (
    {
      variant = 'matte',
      brackets = false,
      padding = 'md',
      interactive = false,
      className,
      children,
      ...rest
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-2xl',
          VARIANT_CLASSES[variant],
          PADDING_CLASSES[padding],
          brackets && 'relative',
          interactive && 'transition-colors duration-150 hover:border-line-strong',
          className
        )}
        {...rest}
      >
        {brackets && <CornerBrackets />}
        {children}
      </div>
    );
  }
);

GlassCard.displayName = 'GlassCard';
