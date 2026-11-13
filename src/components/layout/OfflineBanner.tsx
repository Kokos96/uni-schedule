import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowsClockwise, WifiSlash, X } from '@phosphor-icons/react';
import {
  glassPanelVariants,
  reducedPageTransitionVariants,
  useAppReducedMotion,
} from '../../lib/motion';

export interface OfflineBannerProps {
  isOnline: boolean;
  updateAvailable: boolean;
  onApplyUpdate: () => void;
  onDismissUpdate: () => void;
}

export const OfflineBanner: React.FC<OfflineBannerProps> = ({
  isOnline,
  updateAvailable,
  onApplyUpdate,
  onDismissUpdate,
}) => {
  const reducedMotion = useAppReducedMotion();
  const variants = reducedMotion
    ? reducedPageTransitionVariants
    : glassPanelVariants;

  return (
    <div
      className="flex flex-col gap-2"
      role="region"
      aria-label="Сповіщення про стан мережі та оновлення"
    >
      <AnimatePresence initial={false}>
        {!isOnline && (
          <motion.div
            key="offline-banner"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="status"
            aria-live="polite"
            className="glass-panel flex items-center gap-3 rounded-2xl px-3.5 py-2.5"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber/25 bg-amber-soft text-amber-fg"
              aria-hidden
            >
              <WifiSlash className="h-4 w-4" weight="duotone" />
            </span>
            <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-ink">
              Офлайн-режим: розклад і нотатки доступні локально
            </p>
          </motion.div>
        )}

        {updateAvailable && (
          <motion.div
            key="update-banner"
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            role="status"
            aria-live="polite"
            className="glass-amber-lit flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3.5 py-2"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber/30 bg-amber-soft text-amber-fg"
                aria-hidden
              >
                <ArrowsClockwise className="h-4 w-4" weight="duotone" />
              </span>
              <p className="min-w-0 text-xs font-medium leading-snug text-ink">
                Доступне оновлення версії
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={onApplyUpdate}
                style={{
                  backgroundColor: 'var(--status-excused-bg)',
                  color: 'var(--status-excused-fg)',
                }}
                className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-xl px-3.5 text-xs font-semibold shadow-sm transition-opacity hover:opacity-90 active:opacity-80"
              >
                Оновити
              </button>
              <button
                type="button"
                onClick={onDismissUpdate}
                aria-label="Закрити сповіщення про оновлення"
                className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl text-ink-secondary transition-colors hover:bg-surface-elevated/70 hover:text-ink"
              >
                <X className="h-4 w-4" weight="bold" aria-hidden />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
