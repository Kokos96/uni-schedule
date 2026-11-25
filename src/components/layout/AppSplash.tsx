import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppReducedMotion } from '../../lib/motion';

let hasPlayedColdSplash = false;

export function resetSplashForTest(): void {
  hasPlayedColdSplash = false;
}

export interface AppSplashProps {
  onComplete?: () => void;
}

export const AppSplash: React.FC<AppSplashProps> = ({ onComplete }) => {
  const reducedMotion = useAppReducedMotion();
  const [visible, setVisible] = useState<boolean>(() => !hasPlayedColdSplash);

  useEffect(() => {
    if (!visible) return;
    hasPlayedColdSplash = true;
    const holdMs = reducedMotion ? 60 : 340;
    const hardTimeoutMs = 900;

    const fadeTimer = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, holdMs);

    const safetyTimer = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, hardTimeoutMs);

    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(safetyTimer);
    };
  }, [visible, reducedMotion, onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="app-startup-splash"
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reducedMotion ? 0.08 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-6 select-none"
        >
          <motion.div
            initial={reducedMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: reducedMotion ? 0.05 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col items-center gap-3.5"
          >
            <img
              src="/icons/icon-192.png"
              alt=""
              width={72}
              height={72}
              className="h-[72px] w-[72px] rounded-2xl border border-line bg-surface-elevated shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
            />
            <span className="font-serif text-lg font-semibold tracking-[-0.02em] text-ink">
              Uni Schedule
            </span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
