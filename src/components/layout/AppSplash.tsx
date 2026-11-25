import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppReducedMotion } from '../../lib/motion';

export type LaunchPhase = 'intro' | 'reveal' | 'done';

let hasPlayedColdSplash = false;

export function getInitialLaunchPhase(): LaunchPhase {
  return hasPlayedColdSplash ? 'done' : 'intro';
}

export function resetSplashForTest(): void {
  hasPlayedColdSplash = false;
}

export interface AppSplashProps {
  phase: LaunchPhase;
  onPhaseChange: (phase: LaunchPhase) => void;
}

export const AppSplash: React.FC<AppSplashProps> = ({ phase, onPhaseChange }) => {
  const reducedMotion = useAppReducedMotion();
  const completedRef = useRef(false);

  useEffect(() => {
    if (phase === 'done' || hasPlayedColdSplash) {
      if (!completedRef.current) {
        completedRef.current = true;
        onPhaseChange('done');
      }
      return;
    }

    hasPlayedColdSplash = true;
    const revealMs = reducedMotion ? 110 : 1750;
    const doneMs = reducedMotion ? 220 : 2500;
    const safetyMs = 3000;

    const revealTimer = window.setTimeout(() => {
      onPhaseChange('reveal');
    }, revealMs);

    const finish = () => {
      if (completedRef.current) return;
      completedRef.current = true;
      onPhaseChange('done');
    };

    const doneTimer = window.setTimeout(finish, doneMs);
    const safetyTimer = window.setTimeout(finish, safetyMs);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(doneTimer);
      window.clearTimeout(safetyTimer);
    };
  }, [phase, reducedMotion, onPhaseChange]);

  const showOverlay = phase !== 'done';

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          key="app-launch-splash"
          data-launch-phase={phase}
          aria-hidden="true"
          initial={{ opacity: 1 }}
          animate={{ opacity: phase === 'reveal' ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{
            duration: reducedMotion ? 0.1 : 0.65,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="pointer-events-none fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-6 select-none"
        >
          <motion.div
            initial={reducedMotion ? { opacity: 1, scale: 1, y: 0 } : { opacity: 0, scale: 0.88, y: 8 }}
            animate={
              phase === 'reveal'
                ? { opacity: 0, scale: reducedMotion ? 1 : 1.04, y: reducedMotion ? 0 : -14 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={{
              duration: reducedMotion ? 0.08 : phase === 'reveal' ? 0.52 : 0.62,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex flex-col items-center"
          >
            <motion.div
              animate={
                reducedMotion || phase === 'reveal'
                  ? { scale: 1 }
                  : { scale: [1, 1.028, 1] }
              }
              transition={
                reducedMotion
                  ? { duration: 0.01 }
                  : { delay: 0.85, duration: 0.85, ease: 'easeInOut' }
              }
              className="relative flex h-20 w-20 items-center justify-center rounded-[22px] border border-line bg-surface-elevated shadow-[0_14px_36px_rgba(0,0,0,0.22)]"
            >
              <img
                src="/icons/icon-192.png"
                alt=""
                width={64}
                height={64}
                className="h-16 w-16 rounded-2xl"
              />
            </motion.div>

            <motion.div
              initial={reducedMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
              animate={{ scaleX: 1, opacity: 1 }}
              transition={
                reducedMotion
                  ? { duration: 0.05 }
                  : { delay: 0.36, duration: 0.5, ease: [0.22, 1, 0.36, 1] }
              }
              className="mt-5 h-[2px] w-12 origin-center rounded-full bg-amber"
            />

            <motion.span
              initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0.05 }
                  : { delay: 0.45, duration: 0.48, ease: [0.22, 1, 0.36, 1] }
              }
              className="mt-3.5 font-serif text-[22px] font-bold tracking-[-0.02em] text-ink"
            >
              Uni Schedule
            </motion.span>

            <motion.span
              initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 0.85, y: 0 }}
              transition={
                reducedMotion
                  ? { duration: 0.05 }
                  : { delay: 0.65, duration: 0.42, ease: [0.22, 1, 0.36, 1] }
              }
              className="mt-1 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-secondary"
            >
              Розклад занять
            </motion.span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
