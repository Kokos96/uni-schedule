import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CheckCircle, Info, Warning, X, XCircle, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import { cn } from '../../utils/cn';

export type ToastVariant = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number; // ms; 0 = persistent until dismissed
  action?: ToastAction;
}

interface ToastItem extends Required<Pick<ToastOptions, 'id' | 'title' | 'variant' | 'duration'>> {
  description?: string;
  action?: ToastAction;
}

export interface ToastContextValue {
  showToast: (options: ToastOptions | string) => string;
  dismiss: (id: string) => void;
  clear: () => void;
  toast: {
    show: (options: ToastOptions | string) => string;
    success: (title: string, options?: Omit<ToastOptions, 'title' | 'variant'>) => string;
    error: (title: string, options?: Omit<ToastOptions, 'title' | 'variant'>) => string;
    warning: (title: string, options?: Omit<ToastOptions, 'title' | 'variant'>) => string;
    info: (title: string, options?: Omit<ToastOptions, 'title' | 'variant'>) => string;
  };
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<
  ToastVariant,
  {
    Icon: PhosphorIcon;
    iconClass: string;
    accentBorder: string;
  }
> = {
  default: {
    Icon: Info,
    iconClass: 'text-beige-fg',
    accentBorder: 'border-l-beige',
  },
  info: {
    Icon: Info,
    iconClass: 'text-amber-fg',
    accentBorder: 'border-l-amber',
  },
  success: {
    Icon: CheckCircle,
    iconClass: 'text-sage-fg',
    accentBorder: 'border-l-sage',
  },
  warning: {
    Icon: Warning,
    iconClass: 'text-amber-fg',
    accentBorder: 'border-l-amber',
  },
  error: {
    Icon: XCircle,
    iconClass: 'text-terracotta-fg',
    accentBorder: 'border-l-terracotta',
  },
};

const MAX_TOASTS = 4;
const DEFAULT_DURATION = 3500;

interface ToastCardProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
  reducedMotion: boolean;
}

const ToastCard: React.FC<ToastCardProps> = ({ item, onDismiss, reducedMotion }) => {
  const timerRef = useRef<number | null>(null);
  const [paused, setPaused] = useState(false);
  const { Icon, iconClass, accentBorder } = VARIANT_STYLES[item.variant];

  useEffect(() => {
    if (item.duration <= 0 || paused) return;

    timerRef.current = window.setTimeout(() => {
      onDismiss(item.id);
    }, item.duration);

    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [item.id, item.duration, paused, onDismiss]);

  return (
    <motion.div
      layout
      role={item.variant === 'error' ? 'alert' : 'status'}
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
      animate={reducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      transition={
        reducedMotion
          ? { duration: 0.12 }
          : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
      }
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'glass-strong pointer-events-auto flex w-full items-start gap-2.5 rounded-2xl border-l-[3px] px-3.5 py-3 shadow-glass',
        accentBorder
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', iconClass)} weight="duotone" aria-hidden />

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium leading-snug text-ink">{item.title}</p>
        {item.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
            {item.description}
          </p>
        )}
        {item.action && (
          <button
            type="button"
            onClick={() => {
              item.action?.onClick();
              onDismiss(item.id);
            }}
            className="mt-1.5 inline-flex items-center rounded-md bg-amber-soft px-2 py-1 text-[11px] font-semibold text-amber-fg transition-colors hover:bg-amber/25 active:scale-[0.97]"
          >
            {item.action.label}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={() => onDismiss(item.id)}
        aria-label="Закрити сповіщення"
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
      >
        <X className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
      </button>
    </motion.div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const prefersReducedMotion = Boolean(useReducedMotion());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clear = useCallback(() => {
    setToasts([]);
  }, []);

  const showToast = useCallback((options: ToastOptions | string) => {
    const normalized: ToastOptions =
      typeof options === 'string' ? { title: options } : options;
    const id =
      normalized.id ??
      `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

    const nextItem: ToastItem = {
      id,
      title: normalized.title,
      description: normalized.description,
      variant: normalized.variant ?? 'default',
      duration: normalized.duration ?? DEFAULT_DURATION,
      action: normalized.action,
    };

    setToasts((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      const updated = [...filtered, nextItem];
      return updated.slice(-MAX_TOASTS);
    });

    return id;
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showToast,
      dismiss,
      clear,
      toast: {
        show: showToast,
        success: (title, options) => showToast({ ...options, title, variant: 'success' }),
        error: (title, options) => showToast({ ...options, title, variant: 'error' }),
        warning: (title, options) => showToast({ ...options, title, variant: 'warning' }),
        info: (title, options) => showToast({ ...options, title, variant: 'info' }),
      },
    }),
    [showToast, dismiss, clear]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions text"
        className="pointer-events-none fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[60] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:right-6 md:w-[360px]"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {toasts.map((item) => (
            <ToastCard
              key={item.id}
              item={item}
              onDismiss={dismiss}
              reducedMotion={prefersReducedMotion}
            />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}
