import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppReducedMotion } from '../../lib/motion';

export type LaunchPhase = 'mark' | 'wordmark' | 'settle' | 'morph' | 'content' | 'done';

let hasCompletedColdSplash = false;

export function getInitialLaunchPhase(): LaunchPhase {
  return hasCompletedColdSplash ? 'done' : 'mark';
}

export function resetSplashForTest(): void {
  hasCompletedColdSplash = false;
}

export interface AppSplashProps {
  phase: LaunchPhase;
  onPhaseChange: (phase: LaunchPhase) => void;
}

const EASE_SIGNATURE = [0.19, 1, 0.22, 1] as const;
const EASE_MORPH = [0.22, 1, 0.36, 1] as const;

/**
 * UNI SCHEDULE — SIGNATURE BRAND REVEAL (v4.2.0 polished)
 *
 * Coordinated ~2500ms cold-launch choreography (zero initial blank interval):
 * - 0–420ms    ('mark')     : Immediate optical 136px emblem emergence + diagonal specular glide
 * - 420–1050ms ('wordmark') : Continuous two-tone "Uni Schedule" editorial wordmark reveal
 * - 1050–1320ms('settle')   : Brief poised brand lockup (270ms, no awkward static hold)
 * - 1320–1980ms('morph')    : Vertical aperture curtain morph into real application interface
 * - 1980–2480ms('content')  : Real header/schedule settle + BottomNav coordinated entrance
 * - 2480ms     ('done')     : Single completion event; all launch layers unmounted
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

    const wordmarkMs = reducedMotion ? 60 : 420;
    const settleMs = reducedMotion ? 110 : 1050;
    const morphMs = reducedMotion ? 160 : 1320;
    const contentMs = reducedMotion ? 230 : 1980;
    const doneMs = reducedMotion ? 300 : 2480;
    const safetyMs = reducedMotion ? 500 : 3100;

    const timers = [
      window.setTimeout(() => emit('wordmark'), wordmarkMs),
      window.setTimeout(() => emit('settle'), settleMs),
      window.setTimeout(() => emit('morph'), morphMs),
      window.setTimeout(() => emit('content'), contentMs),
      window.setTimeout(() => emit('done'), doneMs),
      window.setTimeout(() => emit('done'), safetyMs),
    ];

    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
    };
    // Mount-only timeline controller — never depends on `phase`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const showOverlay = phase !== 'done';
  const isWordmarkVisible =
    phase === 'wordmark' || phase === 'settle' || phase === 'morph' || phase === 'content';
  const isMorphing = phase === 'morph' || phase === 'content';
  const isBlocking = phase === 'mark' || phase === 'wordmark' || phase === 'settle';

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
                : { clipPath: 'inset(0% 0% 100% 0%)', opacity: 0.99 }
              : { clipPath: 'inset(0% 0% 0% 0%)', opacity: 1 }
          }
          exit={{ opacity: 0, transition: { duration: 0.05 } }}
          transition={{
            duration: reducedMotion ? 0.14 : 0.62,
            ease: EASE_MORPH,
          }}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-6 select-none ${
            isBlocking ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <motion.div
            initial={{ opacity: 1, scale: 1, y: 0 }}
            animate={
              isMorphing
                ? reducedMotion
                  ? { opacity: 0, scale: 1, y: 0 }
                  : { opacity: 0, scale: 0.88, y: -64 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            transition={{
              duration: reducedMotion ? 0.12 : 0.54,
              ease: EASE_MORPH,
            }}
            className="relative flex flex-col items-center"
          >
            {/* Clean Optical 136px Emblem — starts immediately on frame 0 without redundant outer ring */}
            <motion.div
              initial={
                reducedMotion
                  ? { opacity: 1, scale: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 32px)' }
                  : { opacity: 0.25, scale: 0.9, y: 12, clipPath: 'inset(35% 0% 0% 0% round 32px)' }
              }
              animate={{ opacity: 1, scale: 1, y: 0, clipPath: 'inset(0% 0% 0% 0% round 32px)' }}
              transition={{
                duration: reducedMotion ? 0.08 : 0.58,
                ease: EASE_SIGNATURE,
              }}
              className="relative h-[136px] w-[136px] overflow-hidden rounded-[32px] shadow-[0_24px_56px_-12px_rgba(0,0,0,0.42)]"
            >
              <img
                src="/icons/icon-512.png"
                alt=""
                width={136}
                height={136}
                className="h-full w-full scale-[1.24] object-cover"
              />

              {/* Single restrained diagonal specular highlight bridging mark reveal into wordmark */}
              {!reducedMotion && !isMorphing && (
                <motion.span
                  initial={{ x: '-130%', opacity: 0 }}
                  animate={{ x: '155%', opacity: [0, 0.34, 0] }}
                  transition={{ delay: 0.18, duration: 0.68, ease: EASE_SIGNATURE }}
                  className="pointer-events-none absolute inset-y-[-20%] left-0 w-1/2 -rotate-[24deg] bg-gradient-to-r from-transparent via-[#F6C896]/55 to-transparent"
                />
              )}
            </motion.div>

            {/* Two-Tone Editorial Wordmark — continuous entrance synchronized with mark settle */}
            <div className="mt-6 overflow-hidden py-1.5">
              <motion.div
                initial={
                  reducedMotion
                    ? { opacity: 1, y: 0, letterSpacing: '-0.025em' }
                    : { opacity: 0, y: 18, letterSpacing: '0.035em' }
                }
                animate={
                  isWordmarkVisible || reducedMotion
                    ? { opacity: 1, y: 0, letterSpacing: '-0.025em' }
                    : { opacity: 0, y: 18, letterSpacing: '0.035em' }
                }
                transition={{
                  duration: reducedMotion ? 0.08 : 0.52,
                  ease: EASE_SIGNATURE,
                }}
                className="flex items-baseline gap-1.5 font-serif text-[32px] leading-tight text-ink"
              >
                <span className="font-bold">Uni</span>
                <span className="font-semibold text-amber-fg">Schedule</span>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
