import { useReducedMotion, type Transition, type Variants } from 'framer-motion';

/**
 * Graphite Glass Motion Tokens (`uni-schedule 2.0`)
 *
 * Restraint rules:
 * - Animate only GPU-composited properties (`transform`, `opacity`) wherever possible.
 * - Never animate `backdrop-filter` blur values continuously.
 * - Always pair with `<LazyMotion features={domAnimation}>` + `<MotionConfig reducedMotion="user">` and reduced-motion fallbacks.
 */

export const MOTION_SPRINGS = {
  /** Active day pill, view switcher thumb, bottom sheet snap */
  tactile: { type: 'spring', stiffness: 420, damping: 32, mass: 0.8 },
  /** Immediate button/pill micro-feedback and layout indicators */
  snappy: { type: 'spring', stiffness: 500, damping: 35 },
  /** Progress bars, gauges, subtle floating panels */
  gentle: { type: 'spring', stiffness: 280, damping: 28 },
} as const satisfies Record<string, Transition>;

export const MOTION_EASE = {
  /** Calm editorial ease-out curve for cards, tabs, and popovers */
  editorial: [0.22, 1, 0.36, 1] as const,
} as const;

export const MOTION_DURATIONS = {
  fast: 0.14,
  normal: 0.22,
  slow: 0.36,
} as const;

/** Touch-drag swipe gesture defaults for `SwipeableDayContainer` (`domAnimation`-compatible) */
export const MOTION_SWIPE = {
  offsetThreshold: 56,
  velocityThreshold: 320,
  directionLockSlop: 10,
  dragResistance: 0.35,
  maxDragOffset: 72,
} as const;

/** Opacity-only fallback transition used when `prefers-reduced-motion` is active */
export const REDUCED_MOTION_TRANSITION: Transition = {
  duration: 0.12,
  ease: 'linear',
};

/**
 * Synchronous media-query check for `prefers-reduced-motion: reduce`.
 * Safe for SSR/test environments where `window` or `matchMedia` may be unavailable.
 */
export function shouldReduceMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * React hook wrapping Framer Motion's `useReducedMotion` with a strict boolean return.
 */
export function useAppReducedMotion(): boolean {
  return Boolean(useReducedMotion());
}

export { useReducedMotion };

/**
 * Returns a reduced-motion-safe transition (`120ms` opacity fade) when reduced motion is active.
 */
export function resolveTransition(transition: Transition, reduced: boolean): Transition {
  return reduced ? REDUCED_MOTION_TRANSITION : transition;
}

/**
 * Top-level tab/view transition.
 * Pass optional `custom={direction}` (`1` | `-1`) for horizontal 8px shift,
 * or omit for a subtle 8px vertical editorial reveal.
 */
export const pageTransitionVariants: Variants = {
  initial: (direction = 0) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? 8 : -8,
    y: direction === 0 ? 8 : 0,
  }),
  animate: {
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: MOTION_EASE.editorial,
    },
  },
  exit: (direction = 0) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? -8 : 8,
    y: direction === 0 ? -6 : 0,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASE.editorial,
    },
  }),
};

/**
 * Opacity-only page transition variant for `prefers-reduced-motion: reduce`.
 */
export const reducedPageTransitionVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: REDUCED_MOTION_TRANSITION },
  exit: { opacity: 0, transition: REDUCED_MOTION_TRANSITION },
};

/**
 * Directional day-switching & swipe transition.
 * Pass `custom={direction}` where `> 0` = next day (enters from right) and `< 0` = previous day.
 */
export const daySwitchVariants: Variants = {
  initial: (direction = 1) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? 24 : -24,
  }),
  animate: {
    opacity: 1,
    x: 0,
    transition: {
      opacity: { duration: MOTION_DURATIONS.normal, ease: MOTION_EASE.editorial },
      x: MOTION_SPRINGS.tactile,
    },
  },
  exit: (direction = 1) => ({
    opacity: 0,
    x: direction === 0 ? 0 : direction > 0 ? -24 : 24,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASE.editorial,
    },
  }),
};

const STAGGER_STEP = 0.045;
const STAGGER_MAX_TOTAL = 0.24;
const STAGGER_CAP_THRESHOLD = 6;

/**
 * Staggered list container variant.
 * Accepts optional `custom={itemCount}` to compress `staggerChildren` so long lists stay instant.
 */
export const staggerListVariants: Variants = {
  initial: { opacity: 0 },
  animate: (itemCount?: number) => {
    const count = typeof itemCount === 'number' && itemCount > 0 ? itemCount : 1;
    const staggerChildren =
      count > STAGGER_CAP_THRESHOLD
        ? Math.min(STAGGER_STEP, STAGGER_MAX_TOTAL / count)
        : STAGGER_STEP;

    return {
      opacity: 1,
      transition: {
        staggerChildren,
        delayChildren: 0.015,
      },
    };
  },
  exit: {
    opacity: 0,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASE.editorial,
    },
  },
};

/**
 * Individual card/row entrance paired with `staggerListVariants`.
 */
export const staggerItemVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: MOTION_EASE.editorial,
    },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASE.editorial,
    },
  },
};

/**
 * Floating glass panels, context menus, and popovers.
 * Static CSS `backdrop-filter` remains untouched; only opacity and transform animate.
 */
export const glassPanelVariants: Variants = {
  initial: { opacity: 0, scale: 0.985, y: 6 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: MOTION_DURATIONS.normal,
      ease: MOTION_EASE.editorial,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.985,
    y: 4,
    transition: {
      duration: MOTION_DURATIONS.fast,
      ease: MOTION_EASE.editorial,
    },
  },
};

/**
 * Responsive modal/sheet transition.
 * Pass `custom={true}` (or `custom="desktop"`) for centered desktop modal scale/fade,
 * or omit / pass `false` (`"mobile"`) for mobile bottom-sheet slide-up.
 */
export const sheetVariants: Variants = {
  initial: (mode: boolean | 'mobile' | 'desktop' = 'mobile') => {
    const isDesktop = mode === true || mode === 'desktop';
    return isDesktop
      ? { opacity: 0, scale: 0.97, y: 10 }
      : { opacity: 0, y: '100%' };
  },
  animate: (mode: boolean | 'mobile' | 'desktop' = 'mobile') => {
    const isDesktop = mode === true || mode === 'desktop';
    return {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: isDesktop
        ? { duration: MOTION_DURATIONS.normal, ease: MOTION_EASE.editorial }
        : MOTION_SPRINGS.tactile,
    };
  },
  exit: (mode: boolean | 'mobile' | 'desktop' = 'mobile') => {
    const isDesktop = mode === true || mode === 'desktop';
    return isDesktop
      ? {
          opacity: 0,
          scale: 0.97,
          y: 8,
          transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASE.editorial },
        }
      : {
          opacity: 0,
          y: '100%',
          transition: { duration: MOTION_DURATIONS.normal, ease: MOTION_EASE.editorial },
        };
  },
};

/**
 * Scrim backdrop fade for modals and bottom sheets.
 */
export const scrimVariants: Variants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: MOTION_DURATIONS.normal, ease: MOTION_EASE.editorial },
  },
  exit: {
    opacity: 0,
    transition: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASE.editorial },
  },
};

/**
 * Smooth accordion reveal for expandable lesson details and inline notes.
 */
export const expandCollapseVariants: Variants = {
  initial: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
  },
  animate: {
    height: 'auto',
    opacity: 1,
    overflow: 'hidden',
    transitionEnd: { overflow: 'visible' },
    transition: {
      height: { duration: MOTION_DURATIONS.normal, ease: MOTION_EASE.editorial },
      opacity: { duration: MOTION_DURATIONS.fast, delay: 0.04, ease: MOTION_EASE.editorial },
    },
  },
  exit: {
    height: 0,
    opacity: 0,
    overflow: 'hidden',
    transition: {
      height: { duration: MOTION_DURATIONS.fast, ease: MOTION_EASE.editorial },
      opacity: { duration: 0.1, ease: MOTION_EASE.editorial },
    },
  },
};

/**
 * Subtle Warm Amber live beacon pulse.
 * Pass `custom={reduced}` (from `useAppReducedMotion()`) to disable infinite pulsing
 * when `prefers-reduced-motion: reduce` is enabled.
 */
export const amberBeaconVariants: Variants = {
  initial: { opacity: 0.95, scale: 1 },
  animate: (reduced = false) =>
    reduced
      ? { opacity: 1, scale: 1 }
      : {
          opacity: [1, 0.45, 1],
          scale: [1, 1.25, 1],
          transition: {
            duration: 2.2,
            repeat: Infinity,
            ease: 'easeInOut',
          },
        },
};
