import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppReducedMotion } from '../../lib/motion';

export type LaunchPhase = 'brand' | 'settle' | 'morph' | 'content' | 'done';

let hasCompletedColdSplash = false;

export function getInitialLaunchPhase(): LaunchPhase {
  return hasCompletedColdSplash ? 'done' : 'brand';
}

export function resetSplashForTest(): void {
  hasCompletedColdSplash = false;
}

export interface AppSplashProps {
  phase: LaunchPhase;
  onPhaseChange: (phase: LaunchPhase) => void;
}

const EASE_EDITORIAL = [0.22, 1, 0.36, 1] as const;

/**
 * Coordinated 2500ms Brand-to-Interface Morph Launch Controller.
 *
 * Timeline (standard motion):
 * - 0–400ms    ('brand')   : Theme-correct canvas + 124px brand mark emergence
 * - 400–1400ms ('settle')  : Editorial amber rule draw + 30px wordmark reveal + restrained highlight sweep
 * - 1400–2050ms('morph')   : Continuous vertical aperture morph lifting into real app header/content
 * - 2050–2500ms('content') : Real header/schedule settle + BottomNav coordinated entrance
 * - 2500ms     ('done')    : Single completion event; all launch layers unmounted
 */
export const AppSplash: React.FC<AppSplashProps> = ({ phase, onPhaseChange }) => {
  const reducedMotion = useAppReducedMotion();
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const completedRef = useRef(hasCompletedColdSplash);

  useEffect(() => {
    if (hasCompletedColdSplash || completedRef.current) {
      if (phase !== 'done') {
        onPhaseChangeRef.current('done');
      }
      return;
    }

    let cancelled = false;
    const emit = (next: LaunchPhase) => {
      if (cancelled || completedRef.current) return;
      if (next === 'done') {
        completedRef.current = true;
        hasCompletedColdSplash = true;
      }
      onPhaseChangeRef.current(next);
    };

    const settleMs = reducedMotion ? 80 : 400;
    const morphMs = reducedMotion ? 160 : 1400;
    const contentMs = reducedMotion ? 240 : 2050;
    const doneMs = reducedMotion ? 320 : 2500;
    const safetyMs = reducedMotion ? 500 : 3100;

    const tSettle = window.setTimeout(() => emit('settle'), settleMs);
    const tMorph = window.setTimeout(() => emit('morph'), morphMs);
    const tContent = window.setTimeout(() => emit('content'), contentMs);
    const tDone = window.setTimeout(() => emit('done'), doneMs);
    const tSafety = window.setTimeout(() => emit('done'), safetyMs);

    return () => {
      cancelled = true;
      window.clearTimeout(tSettle);
      window.clearTimeout(tMorph);
      window.clearTimeout(tContent);
      window.clearTimeout(tDone);
      window.clearTimeout(tSafety);
    };
    // Mount-only timeline controller (re-evaluates only if reducedMotion preference changes before finish).
    // Never depends on `phase`, preventing premature completion on phase transitions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const showOverlay = phase !== 'done';
  const isMorphing = phase === 'morph' || phase === 'content';
  const isBlocking = phase === 'brand' || phase === 'settle';

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          key="app-launch-splash"
          data-launch-phase={phase}
          aria-hidden="true"
          initial={{ clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }}
          animate={
            isMorphing
              ? reducedMotion
                ? { opacity: 0 }
                : { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0.98 }
              : { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }
          }
          exit={{ opacity: 0, transition: { duration: 0.05 } }}
          transition={{
            duration: reducedMotion ? 0.14 : 0.62,
            ease: EASE_EDITORIAL,
          }}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-6 select-none ${
            isBlocking ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <motion.div
            initial={
              reducedMotion
                ? { opacity: 1, scale: 1, y: 0 }
                : { opacity: 0, scale: 0.9, y: 12 }
            }
            animate={
              isMorphing
                ? reducedMotion
                  ? { opacity: 0, scale: 1, y: 0 }
                  : { opacity: 0, scale: 0.86, y: -56 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={{
              duration: reducedMotion ? 0.12 : isMorphing ? 0.52 : 0.44,
              ease: EASE_EDITORIAL,
            }}
            className="flex flex-col items-center"
          >
            {/* Brand Emblem — 124px clean direct asset without nested card frame */}
            <motion.img
              src="/icons/icon-512.png"
              alt=""
              width={124}
              height={124}
              initial={reducedMotion ? { scale: 1 } : { scale: 0.94 }}
              animate={
                isMorphing
                  ? { scale: reducedMotion ? 1 : 0.9 }
                  : { scale: 1 }
              }
              transition={{
                duration: reducedMotion ? 0.08 : 0.48,
                ease: EASE_EDITORIAL,
              }}
              className="h-[124px] w-[124px] rounded-[28px] shadow-[0_18px_44px_rgba(0,0,0,0.26)]"
            />

            {/* Continuous Editorial Amber Hairline (morphs horizontally on exit) */}
            <div className="relative mt-6 h-[2.5px] w-14 overflow-hidden rounded-full">
              <motion.div
                initial={reducedMotion ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
                animate={
                  isMorphing
                    ? { scaleX: reducedMotion ? 1 : 3.2, opacity: 0 }
                    : phase === 'settle'
                      ? { scaleX: 1, opacity: 1 }
                      : { scaleX: 0, opacity: 0 }
                }
                transition={{
                  duration: reducedMotion ? 0.08 : isMorphing ? 0.48 : 0.46,
                  ease: EASE_EDITORIAL,
                }}
                className="h-full w-full origin-center rounded-full bg-amber"
              />
              {!reducedMotion && phase === 'settle' && (
                <motion.div
                  initial={{ x: '-110%', opacity: 0 }}
                  animate={{ x: '220%', opacity: [0, 0.75, 0] }}
                  transition={{ delay: 0.42, duration: 0.56, ease: EASE_EDITORIAL }}
                  className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-[#FFF4E4]/75 to-transparent"
                />
              )}
            </div>

            {/* Product Name — 30px editorial serif */}
            <div className="mt-3 overflow-hidden py-1.5">
              <motion.span
                initial={reducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                animate={
                  phase === 'brand' && !reducedMotion
                    ? { opacity: 0, y: 20 }
                    : { opacity: 1, y: 0 }
                }
                transition={{
                  duration: reducedMotion ? 0.06 : 0.46,
                  ease: EASE_EDITORIAL,
                }}
                className="block font-serif text-[30px] font-bold leading-tight tracking-[-0.025em] text-ink"
              >
                Uni Schedule
              </motion.span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
