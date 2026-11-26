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

/** Fixed tile geometry matching the approved Hybrid #25 render (5-day row fits 320px–1280px). */
const TILE_W = 58;
const TILE_H = 74;
const TILE_GAP = 7;
const SLOT_PITCH = TILE_W + TILE_GAP; // 65px between tile centers

/**
 * UNI SCHEDULE v4.3.1 — HYBRID #25: SIGNATURE CALENDAR REVEAL (3000ms)
 *
 * Frame-accurate programmatic implementation of approved references
 * (`uni_launch_25_dark_3s.mp4` & `uni_launch_25_light_3s.mp4`):
 * - Phase A (`sunrise`,  0–620ms)   : Centered amber sun rises progressively from horizon clip;
 *                                     symmetric amber arch draws left-over-top-to-right;
 *                                     two subtle horizon lines + prominent serif `Uni Schedule` wordmark.
 * - Phase B (`date`,     620–1150ms): Real active weekday + day number fade in at dead center inside
 *                                     the sun, then the centered sun morphs smoothly into the rounded date tile.
 * - Phase C (`calendar`, 1150–1900ms): Active amber tile glides into its weekday slot while real
 *                                     surrounding weekday tiles fan out symmetrically; arch fades out.
 * - Phase D (`reveal`,   1900–2580ms): Wordmark clears cleanly before the live AppShell rises from the
 *                                     bottom inside a convex dome clip-path (single continuous scene).
 * - Phase E (`settle`,   2580–3000ms): Live app fully uncovered + BottomNav rises; completes at 3000ms.
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

  // Freeze real calendar dates for the duration of this cold launch
  const launchCalendar = useMemo(() => {
    const base = activeDate ?? new Date();
    const baseIso = formatIsoDate(base);
    const dayNum = getScheduleDayNumber(base);
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
      window.setTimeout(() => emit('date'), 620),
      window.setTimeout(() => emit('calendar'), 1150),
      window.setTimeout(() => emit('reveal'), 1900),
      window.setTimeout(() => emit('settle'), 2580),
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
  const isSettled = phase === 'settle';
  const isBlocking = phase === 'sunrise' || phase === 'date' || phase === 'calendar';

  const centerIdx = 2; // middle of 5-day strip
  const activeTargetX = (launchCalendar.activeIndex - centerIdx) * SLOT_PITCH;

  return (
    <AnimatePresence>
      {showOverlay && (
        <motion.div
          key="app-launch-splash-hybrid25"
          data-launch-phase={phase}
          data-testid="app-splash-hybrid25"
          aria-hidden="true"
          initial={{ opacity: 1 }}
          animate={{ opacity: reducedMotion && isRevealing ? 0 : isSettled ? 0 : 1 }}
          exit={{ opacity: 0, transition: { duration: 0.05 } }}
          transition={{ duration: reducedMotion ? 0.18 : 0.14, ease: EASE_SUNRISE }}
          style={{ contain: 'layout style paint' }}
          className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-3 select-none ${
            isBlocking ? 'pointer-events-auto' : 'pointer-events-none'
          }`}
        >
          {/* Main focal stage — centered identically to approved Hybrid #25 render */}
          <div
            className="relative flex w-full max-w-[340px] flex-col items-center -mt-12"
            style={{ contain: 'layout style' }}
          >
            {/* Stage box holding Symmetric Arch + Horizon-Clipped Sun -> Centered Date -> 5-Day Strip */}
            <div className="relative flex h-[174px] w-full items-center justify-center">
              {/* Symmetric Quiet Sunrise Amber Arch (draws smoothly left -> top -> right) */}
              {!reducedMotion && (
                <svg
                  viewBox="0 0 210 166"
                  className="pointer-events-none absolute h-[166px] w-[210px]"
                  fill="none"
                  aria-hidden="true"
                >
                  <motion.path
                    d="M 18 154 L 18 90 A 87 87 0 0 1 192 90 L 192 154"
                    stroke="currentColor"
                    strokeWidth="1.25"
                    strokeLinecap="round"
                    className="text-amber"
                    initial={{ pathLength: 0.08, opacity: 0.85 }}
                    animate={{
                      pathLength: 1,
                      opacity: isCalendarExpanded ? 0 : 0.9,
                    }}
                    transition={{
                      pathLength: { duration: 0.72, ease: EASE_SUNRISE },
                      opacity: { duration: 0.42, ease: EASE_SUNRISE },
                    }}
                  />
                  {/* Two subtle concentric horizon lines under the rising sun */}
                  <motion.line
                    x1="46"
                    y1="138"
                    x2="164"
                    y2="138"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-line-strong"
                    initial={{ opacity: 0.35, scaleX: 0.4 }}
                    animate={{
                      opacity: isCalendarExpanded ? 0 : 0.6,
                      scaleX: isCalendarExpanded ? 0.8 : 1,
                    }}
                    style={{ transformOrigin: '105px 138px' }}
                    transition={{ duration: 0.45, ease: EASE_SUNRISE }}
                  />
                  <motion.line
                    x1="70"
                    y1="148"
                    x2="140"
                    y2="148"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="text-line-strong"
                    initial={{ opacity: 0.2, scaleX: 0.3 }}
                    animate={{
                      opacity: isCalendarExpanded ? 0 : 0.4,
                      scaleX: isCalendarExpanded ? 0.7 : 1,
                    }}
                    style={{ transformOrigin: '105px 148px' }}
                    transition={{ duration: 0.5, delay: 0.08, ease: EASE_SUNRISE }}
                  />
                </svg>
              )}

              {/* Horizon-clipped rising sun layer (0..620ms) -> seamlessly hands off at dead center */}
              <div
                className="relative flex h-[112px] w-full items-center justify-center"
                style={{
                  // Clip below the horizon line during initial sunrise so the sun truly emerges upward
                  clipPath:
                    !reducedMotion && !isDatePhase
                      ? 'inset(0px 0px 14px 0px)'
                      : 'inset(-24px -24px -24px -24px)',
                }}
              >
                {/* 4 Neighbor weekday tiles: emerge from behind active tile & fan out symmetrically */}
                {launchCalendar.items.map((item, idx) => {
                  if (item.isActive) return null;
                  const targetX = (idx - centerIdx) * SLOT_PITCH;
                  const dist = Math.abs(idx - launchCalendar.activeIndex);
                  const delay = dist * 0.055;
                  return (
                    <motion.div
                      key={item.iso}
                      initial={{
                        x: activeTargetX,
                        opacity: 0,
                        scale: 0.86,
                      }}
                      animate={
                        isCalendarExpanded
                          ? {
                              x: targetX,
                              opacity: 1,
                              scale: 1,
                            }
                          : {
                              x: 0,
                              opacity: 0,
                              scale: 0.86,
                            }
                      }
                      transition={{
                        duration: reducedMotion ? 0.1 : 0.48,
                        delay: isCalendarExpanded && !reducedMotion ? delay : 0,
                        ease: EASE_SIGNATURE,
                      }}
                      style={{
                        width: TILE_W,
                        height: TILE_H,
                        willChange: 'transform, opacity',
                      }}
                      className="absolute flex flex-col items-center justify-center rounded-2xl border border-line bg-surface-elevated/90 text-ink"
                    >
                      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-ink-muted">
                        {item.shortDay}
                      </span>
                      <span className="mt-1 font-serif text-[21px] font-semibold leading-none tabular-nums text-ink">
                        {item.dayOfMonth}
                      </span>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isRevealing ? 0.55 : 0 }}
                        transition={{ duration: 0.25 }}
                        className="mt-1.5 h-1 w-1 rounded-full bg-ink-muted"
                      />
                    </motion.div>
                  );
                })}

                {/* Active Amber Hero: rises from horizon dead-center -> reveals date -> morphs into tile -> glides to weekday slot */}
                {(() => {
                  const activeItem = launchCalendar.items[launchCalendar.activeIndex] ?? {
                    iso: 'active',
                    shortDay: '',
                    dayOfMonth: new Date().getDate(),
                    isActive: true,
                  };
                  return (
                    <motion.div
                      key={activeItem.iso}
                      data-testid="splash-active-date-tile"
                      initial={
                        reducedMotion
                          ? {
                              x: activeTargetX,
                              y: 0,
                              width: TILE_W,
                              height: TILE_H,
                              borderRadius: 16,
                            }
                          : {
                              x: 0,
                              y: 54,
                              width: 90,
                              height: 90,
                              borderRadius: 45,
                            }
                      }
                      animate={
                        reducedMotion
                          ? {
                              x: activeTargetX,
                              y: 0,
                              width: TILE_W,
                              height: TILE_H,
                              borderRadius: 16,
                            }
                          : isCalendarExpanded
                            ? {
                                x: activeTargetX,
                                y: 0,
                                width: TILE_W,
                                height: TILE_H,
                                borderRadius: 16,
                              }
                            : isDatePhase
                              ? {
                                  x: 0,
                                  y: 0,
                                  width: 72,
                                  height: 82,
                                  borderRadius: 24,
                                }
                              : {
                                  x: 0,
                                  y: 0,
                                  width: 90,
                                  height: 90,
                                  borderRadius: 45,
                                }
                      }
                      transition={{
                        y: { duration: 0.58, ease: EASE_SUNRISE },
                        x: { duration: 0.5, ease: EASE_SIGNATURE },
                        width: { duration: 0.46, ease: EASE_SIGNATURE },
                        height: { duration: 0.46, ease: EASE_SIGNATURE },
                        borderRadius: { duration: 0.46, ease: EASE_SIGNATURE },
                      }}
                      style={{ willChange: 'transform, width, height, border-radius' }}
                      className="absolute z-20 flex flex-col items-center justify-center bg-amber text-[#242522] shadow-[0_14px_30px_-14px_rgba(216,139,69,0.45)]"
                    >
                      <motion.span
                        initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 4 }}
                        animate={{
                          opacity: isDatePhase || reducedMotion ? 0.92 : 0,
                          y: isDatePhase || reducedMotion ? 0 : 4,
                        }}
                        transition={{ duration: 0.26, ease: EASE_SUNRISE }}
                        className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#FAF8F4] dark:text-[#242522]"
                      >
                        {activeItem.shortDay}
                      </motion.span>
                      <motion.span
                        initial={{ opacity: reducedMotion ? 1 : 0, scale: reducedMotion ? 1 : 0.84 }}
                        animate={{
                          opacity: isDatePhase || reducedMotion ? 1 : 0,
                          scale: isDatePhase || reducedMotion ? 1 : 0.84,
                        }}
                        transition={{ duration: 0.3, delay: isDatePhase ? 0.06 : 0, ease: EASE_SUNRISE }}
                        className="mt-1 font-serif text-[23px] font-bold leading-none tabular-nums text-[#FAF8F4] dark:text-[#242522]"
                      >
                        {activeItem.dayOfMonth}
                      </motion.span>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: isRevealing ? 0.75 : 0 }}
                        transition={{ duration: 0.25 }}
                        className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[#FAF8F4] dark:bg-[#242522]"
                      />
                    </motion.div>
                  );
                })()}
              </div>
            </div>

            {/* Editorial serif wordmark `Uni Schedule` — proportioned to match approved render,
                fades out cleanly BEFORE the bottom-up reveal wave reaches center (zero overlap) */}
            <motion.div
              initial={{ opacity: reducedMotion ? 1 : 0, y: reducedMotion ? 0 : 8 }}
              animate={{
                opacity: isRevealing ? 0 : 1,
                y: isRevealing ? -6 : 0,
              }}
              transition={{
                duration: isRevealing ? 0.22 : 0.45,
                delay: !isRevealing && !reducedMotion ? 0.24 : 0,
                ease: EASE_SUNRISE,
              }}
              className="mt-2 flex flex-col items-center"
            >
              <span className="font-serif text-[32px] sm:text-[35px] font-medium tracking-[-0.02em] leading-none text-ink">
                Uni Schedule
              </span>
              <motion.span
                initial={{ scaleX: reducedMotion ? 1 : 0, opacity: reducedMotion ? 0.85 : 0 }}
                animate={{
                  scaleX: isDatePhase && !isRevealing ? 1 : 0,
                  opacity: isDatePhase && !isRevealing ? 0.9 : 0,
                }}
                transition={{ duration: 0.42, ease: EASE_SIGNATURE }}
                className="mt-3.5 h-[1.5px] w-16 origin-center rounded-full bg-amber"
              />
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
