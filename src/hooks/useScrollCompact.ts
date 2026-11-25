import { useEffect, useRef, useState } from 'react';
import { useMotionValue, useSpring, type MotionValue } from 'framer-motion';

export interface ScrollDockOptions {
  /** ScrollY below which the dock is always fully expanded. */
  topThreshold?: number;
  /** ScrollY past which downward scrolling starts compressing the dock. */
  startThreshold?: number;
  /** Downward scroll distance (px) for full 0 -> 1 compression. */
  downDistance?: number;
  /** Upward scroll distance (px) for full 1 -> 0 expansion. */
  upDistance?: number;
  /** Tab key or route key that resets the dock to expanded without flicker. */
  resetKey?: string | number;
  /** When true, scroll updates are paused (e.g. virtual keyboard open). */
  paused?: boolean;
  /** When true, jumps directly without spring lag. */
  reducedMotion?: boolean;
}

export interface ScrollDockMotion {
  /** Smoothly damped 0 (expanded) .. 1 (compact) progress MotionValue (zero per-frame React re-renders). */
  progress: MotionValue<number>;
  /** Low-frequency semantic state for accessibility/diagnostics (updates only when crossing 0.5). */
  dockState: 'expanded' | 'compact';
}

const DOCK_PROGRESS_SPRING = {
  stiffness: 320,
  damping: 34,
  mass: 0.72,
};

/**
 * Scroll-driven adaptive dock progress inspired by native mobile feeds (e.g. Instagram).
 * Responds continuously to accumulated scroll displacement and direction reversals,
 * settles cleanly when scrolling stops, and never triggers React re-renders per frame.
 */
export function useScrollDockProgress({
  topThreshold = 18,
  startThreshold = 26,
  downDistance = 110,
  upDistance = 88,
  resetKey,
  paused = false,
  reducedMotion = false,
}: ScrollDockOptions = {}): ScrollDockMotion {
  const rawProgress = useMotionValue(0);
  const smoothProgress = useSpring(rawProgress, DOCK_PROGRESS_SPRING);
  const [dockState, setDockState] = useState<'expanded' | 'compact'>('expanded');

  const lastYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const suppressUntilRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const setProgress = (next: number) => {
    const clamped = Math.max(0, Math.min(1, next));
    rawProgress.set(clamped);
    if (reducedMotion) {
      smoothProgress.jump(clamped);
    }
    const nextState: 'expanded' | 'compact' = clamped >= 0.5 ? 'compact' : 'expanded';
    setDockState((prev) => (prev === nextState ? prev : nextState));
  };

  useEffect(() => {
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    setProgress(0);
    lastYRef.current = typeof window !== 'undefined' ? Math.max(0, window.scrollY) : 0;
    // Ignore programmatic scrollTo(0) immediately after tab transitions.
    suppressUntilRef.current = typeof performance !== 'undefined' ? performance.now() + 200 : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scheduleSettle = () => {
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (pausedRef.current) return;
        const current = rawProgress.get();
        if (current > 0.04 && current < 0.96) {
          setProgress(current >= 0.42 ? 1 : 0);
        }
      }, 140);
    };

    const evaluate = () => {
      rafRef.current = null;
      if (pausedRef.current) return;

      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const rawY = window.scrollY;
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const y = Math.max(0, Math.min(rawY, maxScroll));

      if (now < suppressUntilRef.current) {
        lastYRef.current = y;
        return;
      }

      if (rawY <= topThreshold) {
        if (rawProgress.get() !== 0) setProgress(0);
        lastYRef.current = y;
        return;
      }

      // Ignore iOS bottom rubber-band bounce
      if (maxScroll > 0 && rawY > maxScroll) {
        return;
      }

      const delta = y - lastYRef.current;
      lastYRef.current = y;

      // Ignore micro-jitter (<1.5px)
      if (Math.abs(delta) < 1.5) return;

      const current = rawProgress.get();
      if (delta > 0 && y >= startThreshold) {
        setProgress(current + delta / downDistance);
        scheduleSettle();
      } else if (delta < 0) {
        setProgress(current + delta / upDistance);
        scheduleSettle();
      }
    };

    const onScroll = () => {
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(evaluate);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (settleTimerRef.current !== null) window.clearTimeout(settleTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topThreshold, startThreshold, downDistance, upDistance, reducedMotion]);

  return { progress: smoothProgress, dockState };
}

/** Backward-compatible boolean helper. */
export function useScrollCompact(options?: { resetKey?: string | number }): boolean {
  const { dockState } = useScrollDockProgress({ resetKey: options?.resetKey });
  return dockState === 'compact';
}
