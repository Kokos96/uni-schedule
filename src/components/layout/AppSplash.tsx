import React, { useEffect, useMemo, useRef } from 'react';
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
  /** Real active calendar date used for Phase B/C/FLIP handoff (never hardcoded). */
  activeDate?: Date;
}

/** Reference-measured geometry (normalized from 780x1820 -> 390x910 logical canvas). */
const SUN_SIZE = 90;
const TILE_W = 62;
const TILE_H = 80;
const SLOT_PITCH = 67; // 62px tile + 5px gap
const ARCH_PATH_LEN = 404; // M 10 156 L 10 92 A 87.5 87.5 0 0 1 185 92 L 185 156
const TOTAL_DURATION_MS = 3000;
const REDUCED_DURATION_MS = 320;

const clamp01 = (v: number): number => (v <= 0 ? 0 : v >= 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOutQuad = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
};
const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const seg = (tMs: number, startMs: number, endMs: number): number =>
  clamp01((tMs - startMs) / Math.max(1, endMs - startMs));

interface TargetTileRect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/**
 * UNI SCHEDULE v4.3.1 — HYBRID #25: EXACT SINGLE-TIMELINE MOTION RECONSTRUCTION (3000ms)
 *
 * Reconstructed directly from 180-frame 60 FPS measurements of `uni_launch_25_dark_3s.mp4`
 * and `uni_launch_25_light_3s.mp4`:
 * - Single continuous `requestAnimationFrame` clock driven by `performance.now()` (0 -> 3000ms).
 * - Zero per-frame React `setState`; all visual updates mutate GPU-composited `transform`,
 *   `opacity`, `strokeDashoffset`, and `clipPath` directly on DOM refs.
 * - True FLIP geometric handoff: measures real `WeekStrip` day-button `DOMRect`s ONCE on mount,
 *   glides & morphs the 5 splash tiles directly onto the live `WeekStrip` tiles (1950 -> 2450ms)
 *   while the live `AppShell` rises bottom-up inside a convex dome clip-path (1920 -> 2560ms).
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

  // DOM refs mutated directly at 60 FPS inside rAF (zero React re-renders per frame)
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const handoffLayerRef = useRef<HTMLDivElement | null>(null);
  const archPathRef = useRef<SVGPathElement | null>(null);
  const archSvgRef = useRef<SVGSVGElement | null>(null);
  const horizon1Ref = useRef<SVGLineElement | null>(null);
  const horizon2Ref = useRef<SVGLineElement | null>(null);
  const horizonClipRef = useRef<HTMLDivElement | null>(null);
  const activeWrapRef = useRef<HTMLDivElement | null>(null);
  const activeBgRef = useRef<HTMLDivElement | null>(null);
  const activeOutlineRef = useRef<HTMLDivElement | null>(null);
  const activeTextRef = useRef<HTMLDivElement | null>(null);
  const activeTextLandedRef = useRef<HTMLDivElement | null>(null);
  const activeDotRef = useRef<HTMLSpanElement | null>(null);
  const wordmarkRef = useRef<HTMLDivElement | null>(null);
  const underlineRef = useRef<HTMLSpanElement | null>(null);
  const neighborRefs = useRef<Array<HTMLDivElement | null>>([]);
  const neighborDotRefs = useRef<Array<HTMLSpanElement | null>>([]);

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
    let rafId = 0;
    let lastEmittedPhase: LaunchPhase = 'sunrise';

    const emitPhase = (next: LaunchPhase) => {
      if (cancelled || next === lastEmittedPhase) return;
      lastEmittedPhase = next;
      if (overlayRef.current) {
        overlayRef.current.setAttribute('data-launch-phase', next);
      }
      if (next === 'done') {
        completedRef.current = true;
        hasCompletedColdSplash = true;
      }
      onPhaseChangeRef.current(next);
    };

    // Query live AppShell reveal wrapper & WeekStrip targets ONCE (never per-frame)
    const revealEl = document.querySelector<HTMLElement>('[data-app-reveal-layer="true"]');
    const weekStripRow = document.querySelector<HTMLElement>('[data-weekstrip-row="true"]');

    // Measure splash stage center and live WeekStrip target rects once layout is ready
    let stageCx = window.innerWidth / 2;
    let stageCy = window.innerHeight * 0.435;
    let targetRects: Record<string, TargetTileRect> | null = null;

    const measureTargetsOnce = () => {
      if (horizonClipRef.current) {
        const sr = horizonClipRef.current.getBoundingClientRect();
        if (sr.width > 0 && sr.height > 0) {
          stageCx = sr.left + sr.width / 2;
          stageCy = sr.top + sr.height / 2;
        }
      }
      if (weekStripRow) {
        const map: Record<string, TargetTileRect> = {};
        const btns = weekStripRow.querySelectorAll<HTMLElement>('[data-weekstrip-iso]');
        btns.forEach((btn) => {
          const iso = btn.getAttribute('data-weekstrip-iso');
          if (!iso) return;
          const r = btn.getBoundingClientRect();
          if (r.width > 10 && r.height > 10) {
            map[iso] = {
              cx: r.left + r.width / 2,
              cy: r.top + r.height / 2,
              w: r.width,
              h: r.height,
            };
          }
        });
        if (Object.keys(map).length >= 3) {
          targetRects = map;
          // Hide real WeekStrip tiles during FLIP handoff so there is NEVER a duplicate calendar
          weekStripRow.style.opacity = '0';
        }
      }
    };

    const cleanupDomOverrides = () => {
      if (revealEl) {
        revealEl.style.clipPath = '';
        revealEl.style.willChange = '';
      }
      if (weekStripRow) {
        weekStripRow.style.opacity = '';
      }
    };

    if (!reducedMotion) {
      measureTargetsOnce();
    }

    const startTime = performance.now();
    const centerIdx = 2;
    const activeIdx = launchCalendar.activeIndex;
    const activeSlotX = (activeIdx - centerIdx) * SLOT_PITCH;
    const activeIso = launchCalendar.items[activeIdx]?.iso ?? '';

    const renderFrame = (elapsed: number) => {
      if (reducedMotion) {
        const pFade = easeOutCubic(seg(elapsed, 110, REDUCED_DURATION_MS));
        if (overlayRef.current) {
          overlayRef.current.style.opacity = String(1 - pFade);
        }
        if (handoffLayerRef.current) {
          handoffLayerRef.current.style.opacity = String(1 - pFade);
        }
        if (elapsed >= 120 && lastEmittedPhase === 'sunrise') emitPhase('reveal');
        if (elapsed >= 220 && lastEmittedPhase === 'reveal') emitPhase('settle');
        if (elapsed >= REDUCED_DURATION_MS) {
          cleanupDomOverrides();
          emitPhase('done');
          return false;
        }
        return true;
      }

      // 1. Phase notifications (only 4 React updates across the entire 3000ms)
      //    BottomNav rises at 2680ms -> 2980ms matching reference bnav_diff curve
      if (elapsed >= 600 && lastEmittedPhase === 'sunrise') emitPhase('date');
      if (elapsed >= 1100 && lastEmittedPhase === 'date') emitPhase('calendar');
      if (elapsed >= 1980 && lastEmittedPhase === 'calendar') emitPhase('reveal');
      if (elapsed >= 2680 && lastEmittedPhase === 'reveal') emitPhase('settle');

      // 2. Sun emergence from horizon (0 -> 500ms, measured cubic rise from y=+90px to y=0)
      const pRise = easeInOutCubic(seg(elapsed, 0, 500));
      const sunRiseY = lerp(90, 0, pRise);
      if (horizonClipRef.current) {
        horizonClipRef.current.style.clipPath =
          elapsed < 520 ? 'inset(-12px -40px 10px -40px)' : 'none';
      }

      // 3. Symmetric Amber Arch (draws 180 -> 750ms, holds, fades 1050 -> 1500ms)
      const pArchDraw = easeOutCubic(seg(elapsed, 180, 750));
      const pArchFade = easeInOutCubic(seg(elapsed, 1050, 1500));
      if (archPathRef.current) {
        archPathRef.current.style.strokeDashoffset = String(ARCH_PATH_LEN * (1 - pArchDraw));
      }
      if (archSvgRef.current) {
        archSvgRef.current.style.opacity = String(clamp01(pArchDraw > 0 ? 1 - pArchFade : 0));
      }
      const pHorizIn = easeOutCubic(seg(elapsed, 120, 500));
      const pHorizOut = easeInOutCubic(seg(elapsed, 1020, 1380));
      const hOp = pHorizIn * (1 - pHorizOut);
      if (horizon1Ref.current) {
        horizon1Ref.current.style.opacity = String(0.55 * hOp);
        horizon1Ref.current.style.transform = `scaleX(${lerp(0.35, 1, pHorizIn)})`;
      }
      if (horizon2Ref.current) {
        horizon2Ref.current.style.opacity = String(0.35 * hOp);
        horizon2Ref.current.style.transform = `scaleX(${lerp(0.25, 1, pHorizIn)})`;
      }

      // 4. Wordmark `Uni Schedule` (fades in 300 -> 750ms, fades out 1880 -> 2220ms as wave arrives)
      const pWmIn = easeOutCubic(seg(elapsed, 300, 750));
      const pWmOut = easeInOutCubic(seg(elapsed, 1880, 2220));
      if (wordmarkRef.current) {
        wordmarkRef.current.style.opacity = String(pWmIn * (1 - pWmOut));
        wordmarkRef.current.style.transform = `translate3d(0, ${lerp(6, 0, pWmIn) - 4 * pWmOut}px, 0)`;
      }
      const pUndIn = easeOutCubic(seg(elapsed, 560, 920));
      if (underlineRef.current) {
        underlineRef.current.style.opacity = String(0.8 * pUndIn * (1 - pWmOut));
        underlineRef.current.style.transform = `scaleX(${pUndIn * (1 - pWmOut)})`;
      }

      // 5. Real Date inside sun (550 -> 820ms), smoothly morphing color on FLIP landing (2160 -> 2440ms)
      const pDateIn = easeOutCubic(seg(elapsed, 550, 820));
      const pTextSwap = easeInOutCubic(seg(elapsed, 2160, 2440));
      if (activeTextRef.current) {
        activeTextRef.current.style.opacity = String(pDateIn * (1 - pTextSwap));
        activeTextRef.current.style.transform = `scale(${lerp(0.86, 1, pDateIn)})`;
      }
      if (activeTextLandedRef.current) {
        activeTextLandedRef.current.style.opacity = String(pTextSwap);
      }

      // 6. Simultaneous Morph (750 -> 1300ms) + Horizontal Slide (750 -> 1580ms)
      const pMorph = easeInOutCubic(seg(elapsed, 750, 1300));
      const pSlide = easeInOutCubic(seg(elapsed, 750, 1580));

      // 7. True Geometric FLIP Handoff synchronized with wave (2020 -> 2480ms)
      const pFlip = easeInOutCubic(seg(elapsed, 2020, 2480));
      const pHandoffFade = easeOutCubic(seg(elapsed, 2460, 2550));

      const baseScaleX = lerp(1, TILE_W / SUN_SIZE, pMorph);
      const baseScaleY = lerp(1, TILE_H / SUN_SIZE, pMorph);
      const baseRadius = lerp(45, 16, pMorph);

      const activeTarget = targetRects?.[activeIso];
      const activeFlipDx = activeTarget ? activeTarget.cx - (stageCx + activeSlotX) : 0;
      const activeFlipDy = activeTarget ? activeTarget.cy - stageCy : -48;
      const activeFlipSx = activeTarget ? activeTarget.w / TILE_W : 0.94;
      const activeFlipSy = activeTarget ? activeTarget.h / TILE_H : 0.88;

      const curActiveX = lerp(0, activeSlotX, pSlide) + activeFlipDx * pFlip;
      const curActiveY = sunRiseY + activeFlipDy * pFlip;
      const curActiveSx = baseScaleX * lerp(1, activeFlipSx, pFlip);
      const curActiveSy = baseScaleY * lerp(1, activeFlipSy, pFlip);

      if (activeWrapRef.current) {
        activeWrapRef.current.style.transform = `translate3d(${curActiveX}px, ${curActiveY}px, 0)`;
        activeWrapRef.current.style.opacity = String(1 - pHandoffFade);
      }
      if (activeBgRef.current) {
        activeBgRef.current.style.transform = `scale(${curActiveSx}, ${curActiveSy})`;
        activeBgRef.current.style.borderRadius = `${baseRadius}px`;
        // Transition solid amber fill -> WeekStrip outlined active style during FLIP (2160 -> 2460ms)
        const pFillOut = easeInOutCubic(seg(elapsed, 2160, 2460));
        activeBgRef.current.style.opacity = String(1 - pFillOut);
      }
      if (activeOutlineRef.current) {
        activeOutlineRef.current.style.transform = `scale(${curActiveSx}, ${curActiveSy})`;
        activeOutlineRef.current.style.borderRadius = `${baseRadius}px`;
        const pOutlineIn = easeInOutCubic(seg(elapsed, 2140, 2440));
        activeOutlineRef.current.style.opacity = String(pOutlineIn);
      }
      if (activeDotRef.current) {
        activeDotRef.current.style.opacity = String(easeOutCubic(seg(elapsed, 2000, 2240)));
      }

      // 8. Neighbor Weekday Tiles Fan-Out (1050 -> 1580ms) + FLIP Handoff (2020 -> 2480ms)
      launchCalendar.items.forEach((item, idx) => {
        if (item.isActive) return;
        const el = neighborRefs.current[idx];
        if (!el) return;
        const dist = Math.abs(idx - activeIdx);
        const startMs = 1050 + dist * 45;
        const endMs = 1580 + dist * 45;
        const pFan = easeInOutCubic(seg(elapsed, startMs, endMs));
        const slotX = (idx - centerIdx) * SLOT_PITCH;
        const tRect = targetRects?.[item.iso];
        const flipDx = tRect ? tRect.cx - (stageCx + slotX) : 0;
        const flipDy = tRect ? tRect.cy - stageCy : -48;
        const flipSx = tRect ? tRect.w / TILE_W : 0.94;
        const flipSy = tRect ? tRect.h / TILE_H : 0.88;

        const nx = lerp(activeSlotX * 0.65, slotX, pFan) + flipDx * pFlip;
        const ny = flipDy * pFlip;
        const nsx = lerp(0.86, 1, pFan) * lerp(1, flipSx, pFlip);
        const nsy = lerp(0.86, 1, pFan) * lerp(1, flipSy, pFlip);

        el.style.transform = `translate3d(${nx}px, ${ny}px, 0) scale(${nsx}, ${nsy})`;
        el.style.opacity = String(pFan * (1 - pHandoffFade));

        const dot = neighborDotRefs.current[idx];
        if (dot) {
          dot.style.opacity = String(easeOutCubic(seg(elapsed, 2000, 2240)) * 0.55);
        }
      });

      // 9. Bottom-Up Convex Dome Wave Reveal on Live AppShell (1960 -> 2600ms)
      //    Exact 50ms fit to reference: 2050ms 13%, 2100ms 21%, 2200ms 39%, 2250ms 49%, 2300ms 60%, 2400ms 81%, 2450ms 90%, 2500ms 97%
      if (revealEl) {
        if (elapsed < 1960) {
          revealEl.style.clipPath = 'ellipse(118% 0% at 50% 100%)';
        } else if (elapsed < 2600) {
          const pRaw = seg(elapsed, 1960, 2600);
          const pWave = 0.72 * pRaw + 0.28 * easeInOutQuad(pRaw);
          const rx = lerp(118, 168, pWave);
          const ry = lerp(0, 112, pWave);
          revealEl.style.clipPath = `ellipse(${rx.toFixed(1)}% ${ry.toFixed(1)}% at 50% 100%)`;
        } else {
          revealEl.style.clipPath = '';
        }
      }

      // 10. Seamless WeekStrip Role Transfer at 2460ms (exact moment FLIP tiles land!)
      if (weekStripRow && targetRects) {
        if (elapsed >= 2460) {
          weekStripRow.style.opacity = '1';
        }
      }

      // Keep FLIP calendar layer ABOVE the rising wave dome during handoff (1960 -> 2550ms)
      if (handoffLayerRef.current) {
        handoffLayerRef.current.style.zIndex = elapsed >= 1960 && elapsed < 2560 ? '108' : '101';
      }

      // Hide splash canvas cleanly once wave has cleared the screen (2580ms)
      if (overlayRef.current) {
        overlayRef.current.style.opacity = elapsed >= 2580 ? '0' : '1';
      }

      if (elapsed >= TOTAL_DURATION_MS) {
        cleanupDomOverrides();
        emitPhase('done');
        return false;
      }
      return true;
    };

    // Render frame 0 synchronously so there is zero flash before first rAF
    renderFrame(0);

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = Math.max(0, now - startTime);
      const keepGoing = renderFrame(elapsed);
      if (keepGoing && !cancelled) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      cleanupDomOverrides();
    };
    // Mount-only single timeline controller — never restarts on `phase`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  if (phase === 'done') return null;

  const isBlocking = phase === 'sunrise' || phase === 'date' || phase === 'calendar';
  const activeItem = launchCalendar.items[launchCalendar.activeIndex] ?? {
    iso: 'active',
    shortDay: '',
    dayOfMonth: new Date().getDate(),
    isActive: true,
  };

  return (
    <>
      {/* Splash Background + Arch + Wordmark (z-[100], sits beneath rising AppShell dome z-[105]) */}
      <div
        ref={overlayRef}
        data-launch-phase={phase}
        data-testid="app-splash-hybrid25"
        aria-hidden="true"
        style={{ contain: 'layout style paint', willChange: 'opacity' }}
        className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-canvas px-3 select-none ${
          isBlocking ? 'pointer-events-auto' : 'pointer-events-none'
        }`}
      >
        <div className="relative flex w-full max-w-[340px] flex-col items-center -mt-12">
          {/* Symmetric Quiet Sunrise Arch & Concentric Horizon Lines */}
          <div className="relative flex h-[174px] w-full items-center justify-center">
            {!reducedMotion && (
              <svg
                ref={archSvgRef}
                viewBox="0 0 195 162"
                className="pointer-events-none absolute h-[162px] w-[195px]"
                fill="none"
                aria-hidden="true"
                style={{ opacity: 0, willChange: 'opacity' }}
              >
                <path
                  ref={archPathRef}
                  d="M 10 156 L 10 92 A 87.5 87.5 0 0 1 185 92 L 185 156"
                  stroke="currentColor"
                  strokeWidth="1.15"
                  strokeLinecap="round"
                  strokeDasharray={ARCH_PATH_LEN}
                  strokeDashoffset={ARCH_PATH_LEN}
                  className="text-amber"
                />
                <line
                  ref={horizon1Ref}
                  x1="36"
                  y1="136"
                  x2="159"
                  y2="136"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-line-strong"
                  style={{ opacity: 0, transformOrigin: '97.5px 136px' }}
                />
                <line
                  ref={horizon2Ref}
                  x1="62"
                  y1="147"
                  x2="133"
                  y2="147"
                  stroke="currentColor"
                  strokeWidth="1"
                  className="text-line-strong"
                  style={{ opacity: 0, transformOrigin: '97.5px 147px' }}
                />
              </svg>
            )}
          </div>

          {/* Editorial serif wordmark `Uni Schedule` + crisp hairline amber underline */}
          <div
            ref={wordmarkRef}
            style={{ opacity: reducedMotion ? 1 : 0, willChange: 'transform, opacity' }}
            className="mt-2.5 flex flex-col items-center"
          >
            <span className="font-serif text-[31px] sm:text-[33px] font-normal tracking-[-0.012em] leading-none text-ink/95">
              Uni Schedule
            </span>
            <span
              ref={underlineRef}
              style={{ opacity: reducedMotion ? 0.8 : 0, transform: 'scaleX(0)', willChange: 'transform, opacity' }}
              className="mt-3 h-[1px] w-12 origin-center rounded-full bg-amber/85"
            />
          </div>
        </div>
      </div>

      {/* Dedicated FLIP Calendar Layer — elevates above rising dome (z-[108]) during 1900 -> 2520ms
          so the 5 calendar tiles physically glide & morph onto the live WeekStrip without crossfade */}
      <div
        ref={handoffLayerRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[101] flex flex-col items-center justify-center px-3 select-none"
      >
        <div className="relative flex w-full max-w-[340px] flex-col items-center -mt-12">
          <div className="relative flex h-[174px] w-full items-center justify-center">
            <div
              ref={horizonClipRef}
              className="relative flex h-[112px] w-full items-center justify-center"
            >
              {/* 4 Neighbor Weekday Tiles */}
              {launchCalendar.items.map((item, idx) => {
                if (item.isActive) return null;
                return (
                  <div
                    key={item.iso}
                    ref={(el) => {
                      neighborRefs.current[idx] = el;
                    }}
                    style={{
                      width: TILE_W,
                      height: TILE_H,
                      opacity: 0,
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
                    <span
                      ref={(el) => {
                        neighborDotRefs.current[idx] = el;
                      }}
                      style={{ opacity: 0 }}
                      className="mt-1.5 h-1 w-1 rounded-full bg-ink-muted"
                    />
                  </div>
                );
              })}

              {/* Active Sun -> Date -> WeekStrip FLIP Hero */}
              <div
                ref={activeWrapRef}
                data-testid="splash-active-date-tile"
                style={{
                  width: SUN_SIZE,
                  height: SUN_SIZE,
                  willChange: 'transform, opacity',
                }}
                className="absolute z-20 flex items-center justify-center"
              >
                {/* Solid Amber Sun / Tile Fill (GPU-scaled, zero width/height layout thrash) */}
                <div
                  ref={activeBgRef}
                  style={{
                    width: SUN_SIZE,
                    height: SUN_SIZE,
                    borderRadius: 45,
                    willChange: 'transform, opacity, border-radius',
                  }}
                  className="absolute inset-0 bg-amber"
                />
                {/* Outlined WeekStrip Active Target Style (cross-morphs in during FLIP landing) */}
                <div
                  ref={activeOutlineRef}
                  style={{
                    width: SUN_SIZE,
                    height: SUN_SIZE,
                    borderRadius: 16,
                    opacity: 0,
                    willChange: 'transform, opacity',
                  }}
                  className="glass-amber-lit absolute inset-0"
                />
                {/* Crisp Unscaled Date Typography (solid amber phase) */}
                <div
                  ref={activeTextRef}
                  style={{ opacity: reducedMotion ? 1 : 0, willChange: 'transform, opacity' }}
                  className="relative z-10 flex flex-col items-center justify-center"
                >
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#FAF8F4] dark:text-[#242522]">
                    {activeItem.shortDay}
                  </span>
                  <span className="mt-1 font-serif text-[22px] font-bold leading-none tabular-nums text-[#FAF8F4] dark:text-[#242522]">
                    {activeItem.dayOfMonth}
                  </span>
                </div>
                {/* Landed WeekStrip-Matched Typography (fades in as amber fill transitions to outline) */}
                <div
                  ref={activeTextLandedRef}
                  style={{ opacity: 0, willChange: 'opacity' }}
                  className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-[10px] font-medium uppercase leading-none tracking-[0.03em] text-amber-fg">
                    {activeItem.shortDay}
                  </span>
                  <span className="font-mono text-[14px] font-semibold leading-none tabular-nums text-ink">
                    {activeItem.dayOfMonth}
                  </span>
                  <span
                    ref={activeDotRef}
                    style={{ opacity: 0 }}
                    className="mt-0.5 h-1.5 w-1.5 rounded-full bg-amber"
                  />
                </div>
              </div>
            </div>
          </div>
          {/* Spacer matching wordmark block height so FLIP layer stays perfectly aligned with overlay */}
          <div className="mt-2 h-[52px]" />
        </div>
      </div>
    </>
  );
};
