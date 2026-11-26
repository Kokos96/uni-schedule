import React, { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useAppReducedMotion } from '../../lib/motion';
import {
  DAY_NAMES_UA_SHORT,
  addDays,
  formatIsoDate,
  getScheduleDayNumber,
  getWeekDates,
} from '../../utils/date';

export type LaunchPhase = 'sunrise' | 'date' | 'calendar' | 'reveal' | 'settle' | 'done';

let hasCompletedColdSplash = false;

export function getInitialLaunchPhase(): LaunchPhase {
  return hasCompletedColdSplash ? 'done' : 'sunrise';
}

export function resetSplashForTest(): void {
  hasCompletedColdSplash = false;
}

export interface AppSplashProps {
  phase: LaunchPhase;
  onPhaseChange: (phase: LaunchPhase) => void;
  /** Real active calendar date used for Phase B/C (never hardcoded). */
  activeDate?: Date;
}

const EASE_SUNRISE = [0.22, 1, 0.36, 1] as const;
const EASE_SIGNATURE = [0.19, 1, 0.22, 1] as const;

/**
 * UNI SCHEDULE v4.3.0 — HYBRID #25: SIGNATURE CALENDAR REVEAL (3000ms)
 *
 * Faithful programmatic implementation of approved references
 * (`uni_launch_25_dark_3s.mp4` & `uni_launch_25_light_3s.mp4`, excluding 0.75s review hold):
 * - Phase A (`sunrise`,  0–650ms)   : Quiet Sunrise amber disc + delicate arch + horizon + editorial wordmark
 * - Phase B (`date`,     650–1150ms): Continuous morph of amber disc into real active date tile
 * - Phase C (`calendar`, 1150–1750ms): Real surrounding weekday tiles expand around the active date
 * - Phase D (`reveal`,   1750–2450ms): Curved wave reveal uncovering the live application interface
 * - Phase E (`settle`,   2450–3000ms): Live schedule settles + BottomNav coordinated rise; completes at 3000ms
 */
export const AppSplash: React.FC<AppSplashProps> = ({
  phase,
  onPhaseChange,
  activeDate,
}) => {
  const reducedMotion = useAppReducedMotion();
  const onPhaseChangeRef = useRef(onPhaseChange);
  onPhaseChangeRef.current = onPhaseChange;

  const completedRef = useRef(hasCompletedColdSplash);

  // Freeze the calendar dates for the duration of this cold launch so re-renders never jitter
  const launchCalendar = useMemo(() => {
    const base = activeDate ?? new Date();
    const baseIso = formatIsoDate(base);
    const dayNum = getScheduleDayNumber(base);
    // Use Mon–Fri workweek when activeDate is a weekday, or 5 days centered on activeDate on weekends
    const days =
      dayNum <= 5
        ? getWeekDates(base, false)
        : [-2, -1, 0, 1, 2].map((delta) => addDays(base, delta));
    const items = days.map((d) => {
      const iso = formatIsoDate(d);
      const dn = getScheduleDayNumber(d);
      return {
        iso,
        shortDay: DAY_NAMES_UA_SHORT[dn] ?? '',
        dayOfMonth: d.getDate(),
        isActive: iso === baseIso,
      };
    });
    const activeIndex = Math.max(
      0,
      items.findIndex((item) => item.isActive)
    );
    return { items, activeIndex };
  }, [activeDate]);

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

    if (reducedMotion) {
      const timers = [
        window.setTimeout(() => emit('reveal'), 120),
        window.setTimeout(() => emit('settle'), 220),
        window.setTimeout(() => emit('done'), 320),
        window.setTimeout(() => emit('done'), 520),
      ];
      return () => {
        cancelled = true;
        for (const id of timers) window.clearTimeout(id);
      };
    }

    const timers = [
      window.setTimeout(() => emit('date'), 650),
      window.setTimeout(() => emit('calendar'), 1150),
      window.setTimeout(() => emit('reveal'), 1750),
      window.setTimeout(() => emit('settle'), 2450),
      window.setTimeout(() => emit('done'), 3000),
      window.setTimeout(() => emit('done'), 3600),
    ];

    return () => {
      cancelled = true;
      for (const id of timers) window.clearTimeout(id);
    };
    // Mount-only timeline controller — never depends on `phase`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const showOverlay = phase !== 'done';
  const isDatePhase =
    phase === 'date' || phase === 'calendar' || phase === 'reveal' || phase === 'settle';
  const isCalendarExpanded =
    phase === 'calendar' || phase === 'reveal' || phase === 'settle';
  const isRevealing = phase === 'reveal' || phase === 'settle';
  const isBlocking = phase === 'sunrise' || phase === 'date' || phase === 'calendar';

  const activeItem = launchCalendar.items[launchCalendar.activeIndex] ?? {
    iso: '',
    shortDay: '',
    dayOfMonth: new Date().getDate(),
    isActive: true,
  };

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          key="app-launch-splash-hybrid25"
          data-launch-phase={phase}
          data-testid="app-splash-hybrid25"
          aria-hidden="true"
          initial={
            reducedMotion
              ? { opacity: 1 }
              : { clipPath: 'ellipse(145% 110% at 50% 100%)', opacity: 1 }
          }
          animate={
            isRevealing
              ? reducedMotion
                ? { opacity: 0 }
                : { clipPath: 'ellipse(145% 0% at 50% 100%)', opacity: 0.99 }
              : reducedMotion
                ? { opacity: 1 }
                : { clipPath: 'ellipse(145% 110% at 50% 100%)', opacity: 1 }
          }
          exit={{ opacity: 0, transition: { duration: 0.06 } }}
          transition={{
            duration: reducedMotion ? 0.18 : 0.72,
            ease: EASE_SIGNATURE,
          }}
          style={{ willChange: 'clip-path, opacity', contain: 'layout style paint' }}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-4 select-none ${
            isBlocking ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          <motion.div
            initial={{ opacity: 1, y: 0, scale: 1 }}
            animate={
              isRevealing
                ? reducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, y: -44, scale: 0.96 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            transition={{
              duration: reducedMotion ? 0.15 : 0.56,
              ease: EASE_SIGNATURE,
            }}
            style={{ willChange: 'transform, opacity' }}
            className="relative flex w-full max-w-[360px] flex-col items-center"
          >
            {/* Stage area holding Quiet Sunrise Arch + Amber Disc -> Active Date -> Calendar Row */}
            <div className="relative flex h-[156px] w-full items-center justify-center" style={{ contain: 'layout style' }}>
              {/* Quiet Sunrise delicate amber arch (Phase A focal, softens in B/C) */}
              {!reducedMotion && (
                <svg
                  viewBox="0 0 180 150"
                  className="pointer-events-none absolute h-[150px] w-[180px]"
                  fill="none"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M 24 142 L 24 80 A 66 66 0 0 1 138 35"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    className="text-amber"
                    initial={{ pathLength: 0.22, opacity: 0.85 }}
                    animate={{
                      pathLength: 1,
                      opacity: isDatePhase ? 0.22 : 0.92,
                    }}
                    transition={{
                      pathLength: { duration: 0.62, ease: EASE_SUNRISE },
                      opacity: { duration: 0.45, ease: EASE_SUNRISE },
                    }}
                  />
                  {/* Subtle sunrise horizon line under the disc */}
                  <motion.line
                    x1="44"
                    y1="136"
                    x2="136"
                    y2="136"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-line-strong"
                    initial={{ opacity: 0.55 }}
                    animate={{ opacity: isDatePhase ? 0 : 0.65 }}
                    transition={{ duration: 0.35 }}
                  />
                </svg>
              )}

              {/* Calendar row container: active tile morphs from amber disc, neighbors fan out */}
              <div className="relative flex items-center justify-center gap-1.5">
                {launchCalendar.items.map((item, idx) => {
                  const distanceFromActive = idx - launchCalendar.activeIndex;
                  if (item.isActive) {
                    return (
                      <motion.div
                        key={item.iso}
                        data-testid="splash-active-date-tile"
                        initial={
                          reducedMotion
                            ? {
                                width: 58,
                                height: 74,
                                borderRadius: 16,
                                scale: 1,
                              }
                            : {
                                width: 88,
                                height: 88,
                                borderRadius: 44,
                                scale: 0.92,
                              }
                        }
                        animate={
                          isDatePhase || reducedMotion
                            ? {
                                width: 58,
                                height: 74,
                                borderRadius: 16,
                                scale: 1,
                              }
                            : {
                                width: 88,
                                height: 88,
                                borderRadius: 44,
                                scale: 1,
                              }
                        }
                        transition={{
                          duration: reducedMotion ? 0.1 : 0.52,
                          ease: EASE_SIGNATURE,
                        }}
                        className="relative z-20 flex shrink-0 flex-col items-center justify-center bg-amber text-[#242522] shadow-[0_14px_32px_-12px_rgba(216,139,69,0.45)]"
                      >
                        <motion.span
                          initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 4 }}
                          animate={{
                            opacity: isDatePhase || reducedMotion ? 0.85 : 0,
                            y: isDatePhase || reducedMotion ? 0 : 4,
                          }}
                          transition={{ duration: 0.28, delay: isDatePhase ? 0.1 : 0 }}
                          className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em]"
                        >
                          {activeItem.shortDay}
                        </motion.span>
                        <motion.span
                          initial={{ opacity: reducedMotion ? 1 : 0, scale: reducedMotion ? 1 : 0.78 }}
                          animate={{
                            opacity: isDatePhase || reducedMotion ? 1 : 0,
                            scale: isDatePhase || reducedMotion ? 1 : 0.78,
                          }}
                          transition={{ duration: 0.32, delay: isDatePhase ? 0.12 : 0, ease: EASE_SUNRISE }}
                          className="mt-0.5 font-mono text-[22px] font-bold leading-none tabular-nums"
                        >
                          {activeItem.dayOfMonth}
                        </motion.span>
                      </motion.div>
                    );
                  }

                  // Neighbor weekday tiles emerge symmetrically around the active amber date tile
                  const offsetPx = -distanceFromActive * 42;
                  const delay = Math.abs(distanceFromActive) * 0.06;
                  return (
                    <motion.div
                      key={item.iso}
                      initial={
                        reducedMotion
                          ? { opacity: 1, x: 0, scale: 1 }
                          : { opacity: 0, x: offsetPx, scale: 0.84 }
                      }
                      animate={
                        isCalendarExpanded || reducedMotion
                          ? { opacity: 1, x: 0, scale: 1 }
                          : { opacity: 0, x: offsetPx, scale: 0.84 }
                      }
                      transition={{
                        duration: reducedMotion ? 0.1 : 0.44,
                        delay: isCalendarExpanded && !reducedMotion ? delay : 0,
                        ease: EASE_SIGNATURE,
                      }}
                      className="z-10 flex h-[74px] w-[58px] shrink-0 flex-col items-center justify-center rounded-2xl border border-line bg-surface text-ink shadow-sm"
                    >
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-ink-secondary">
                        {item.shortDay}
                      </span>
                      <span className="mt-0.5 font-mono text-[20px] font-semibold leading-none tabular-nums text-ink">
                        {item.dayOfMonth}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>

            {/* Editorial Wordmark + subtle amber underline */}
            <motion.div
              initial={{ opacity: reducedMotion ? 1 : 0.44, y: reducedMotion ? 0 : 6 }}
              animate={{
                opacity: isDatePhase || reducedMotion ? 1 : 0.62,
                y: 0,
              }}
              transition={{ duration: reducedMotion ? 0.1 : 0.5, ease: EASE_SUNRISE }}
              className="mt-4 flex flex-col items-center"
            >
              <div className="flex items-baseline gap-1.5 font-serif text-[30px] leading-tight tracking-[-0.02em] text-ink">
                <span className="font-semibold">Uni</span>
                <span className="font-medium">Schedule</span>
              </div>
              <motion.span
                initial={{ scaleX: reducedMotion ? 1 : 0, opacity: reducedMotion ? 1 : 0 }}
                animate={{
                  scaleX: isDatePhase || reducedMotion ? 1 : 0,
                  opacity: isDatePhase || reducedMotion ? 0.85 : 0,
                }}
                transition={{ duration: 0.4, ease: EASE_SIGNATURE }}
                className="mt-2.5 h-[1.5px] w-16 origin-center rounded-full bg-amber"
              />
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
