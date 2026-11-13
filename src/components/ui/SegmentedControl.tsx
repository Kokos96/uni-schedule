import React, { useId, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps<T extends string> {
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  layoutId?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  fullWidth?: boolean;
  className?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  layoutId,
  ariaLabel,
  size = 'md',
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  const generatedId = useId();
  const resolvedLayoutId = layoutId ?? `segmented-${generatedId}`;
  const prefersReducedMotion = useReducedMotion();
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const enabledIndices = options
      .map((opt, idx) => (!opt.disabled ? idx : -1))
      .filter((idx) => idx !== -1);

    if (enabledIndices.length === 0) return;

    const currentPos = enabledIndices.indexOf(currentIndex);
    let nextIndex: number | undefined;

    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = enabledIndices[(currentPos + 1) % enabledIndices.length];
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = enabledIndices[(currentPos - 1 + enabledIndices.length) % enabledIndices.length];
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = enabledIndices[0];
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = enabledIndices[enabledIndices.length - 1];
    }

    if (nextIndex !== undefined) {
      const targetOption = options[nextIndex];
      if (targetOption && !targetOption.disabled) {
        onChange(targetOption.value);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center rounded-xl border border-line bg-surface-elevated/90 p-1 select-none',
        fullWidth && 'w-full',
        className
      )}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;

        return (
          <button
            key={option.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={option.disabled}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => {
              if (!option.disabled && option.value !== value) {
                onChange(option.value);
              }
            }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'relative inline-flex min-w-0 items-center justify-center gap-1 xs:gap-1.5 rounded-lg font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
              fullWidth && 'flex-1',
              size === 'sm'
                ? 'min-h-[30px] px-2 xs:px-2.5 text-[11px] xs:text-xs'
                : 'min-h-[36px] px-2 xs:px-3 text-xs xs:text-[13px]',
              isSelected ? 'text-ink' : 'text-ink-secondary hover:text-ink',
              option.disabled && 'cursor-not-allowed opacity-45'
            )}
          >
            {isSelected && (
              <motion.span
                layoutId={resolvedLayoutId}
                transition={
                  prefersReducedMotion
                    ? { duration: 0.12 }
                    : { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }
                }
                className="absolute inset-0 rounded-lg border border-line-strong/40 bg-surface shadow-elevated"
                aria-hidden="true"
              />
            )}
            <span className="relative z-10 inline-flex min-w-0 max-w-full items-center gap-1 xs:gap-1.5">
              {option.icon && (
                <span className={cn('shrink-0', isSelected ? 'text-amber-fg' : 'text-ink-secondary')} aria-hidden="true">
                  {option.icon}
                </span>
              )}
              <span className="min-w-0 truncate">{option.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
