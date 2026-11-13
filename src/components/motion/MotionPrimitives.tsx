import React, { useEffect, useRef, useState } from 'react';
import {
  LazyMotion,
  MotionConfig,
  animate,
  domAnimation,
  m,
  useMotionValue,
  useSpring,
  useTransform,
  type HTMLMotionProps,
  type Variants,
} from 'framer-motion';
import {
  MOTION_EASE,
  MOTION_SPRINGS,
  MOTION_SWIPE,
  REDUCED_MOTION_TRANSITION,
  pageTransitionVariants,
  reducedPageTransitionVariants,
  staggerItemVariants,
  staggerListVariants,
  useAppReducedMotion,
} from '../../lib/motion';

function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

const reducedFadeVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: REDUCED_MOTION_TRANSITION },
  exit: { opacity: 0, transition: REDUCED_MOTION_TRANSITION },
};

/* -------------------------------------------------------------------------- */
/* 1. AppMotionProvider                                                       */
/* -------------------------------------------------------------------------- */

export interface AppMotionProviderProps {
  children: React.ReactNode;
}

/**
 * Root motion provider loading lightweight `domAnimation` features via `LazyMotion`
 * and enforcing `prefers-reduced-motion` across all Framer Motion trees.
 */
export const AppMotionProvider: React.FC<AppMotionProviderProps> = ({ children }) => {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
};

/* -------------------------------------------------------------------------- */
/* 2. PageTransition                                                          */
/* -------------------------------------------------------------------------- */

export interface PageTransitionProps {
  /** Unique key representing the active tab or view */
  pageKey: string | number;
  /** Optional directional hint (`1` = forward, `-1` = backward, `0` = vertical 8px) */
  direction?: number;
  children: React.ReactNode;
  className?: string;
}

/**
 * Non-blocking keyed top-level view switcher.
 * Uses keyed `<m.div>` entry transitions without `<AnimatePresence mode="wait">`
 * so tab switches remain instant and never deadlock with nested presence trees.
 */
export const PageTransition: React.FC<PageTransitionProps> = ({
  pageKey,
  direction = 0,
  children,
  className,
}) => {
  const reduced = useAppReducedMotion();

  return (
    <m.div
      key={pageKey}
      custom={direction}
      variants={reduced ? reducedPageTransitionVariants : pageTransitionVariants}
      initial="initial"
      animate="animate"
      className={cx('w-full', className)}
    >
      {children}
    </m.div>
  );
};

/* -------------------------------------------------------------------------- */
/* 3. StaggerList & StaggerCard                                               */
/* -------------------------------------------------------------------------- */

export interface StaggerListProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: React.ReactNode;
  /** Optional explicit item count used to cap stagger duration on long lists */
  itemCount?: number;
}

/**
 * Staggered list container (`staggerChildren: 0.045`, capped for long lists).
 */
export const StaggerList: React.FC<StaggerListProps> = ({
  children,
  itemCount,
  className,
  ...rest
}) => {
  const reduced = useAppReducedMotion();
  const resolvedCount = itemCount ?? React.Children.count(children);

  return (
    <m.div
      variants={reduced ? reducedFadeVariants : staggerListVariants}
      custom={resolvedCount}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      {...rest}
    >
      {children}
    </m.div>
  );
};

export interface StaggerCardProps extends Omit<HTMLMotionProps<'div'>, 'variants'> {
  children: React.ReactNode;
  /** Enables subtle hover depth (`y: -1`) and tap feedback (`scale: 0.985`). Default: `true`. */
  interactive?: boolean;
}

/**
 * Staggered card item with Graphite Glass tactile hover/tap microinteraction.
 */
export const StaggerCard: React.FC<StaggerCardProps> = ({
  children,
  interactive = true,
  className,
  ...rest
}) => {
  const reduced = useAppReducedMotion();
  const enableGestures = interactive && !reduced;

  return (
    <m.div
      variants={reduced ? reducedFadeVariants : staggerItemVariants}
      whileHover={enableGestures ? { y: -1, transition: MOTION_SPRINGS.tactile } : undefined}
      whileTap={enableGestures ? { scale: 0.985, transition: MOTION_SPRINGS.snappy } : undefined}
      className={className}
      {...rest}
    >
      {children}
    </m.div>
  );
};

/* -------------------------------------------------------------------------- */
/* 4. AnimatedProgressBar                                                     */
/* -------------------------------------------------------------------------- */

export interface AnimatedProgressBarProps {
  /** Percentage value between 0 and 100 */
  value: number;
  className?: string;
  trackClassName?: string;
  barClassName?: string;
  /** Accessible label for screen readers */
  label?: string;
  /** Subtle warm amber sheen on mount and percentage updates (default: `true`) */
  shimmer?: boolean;
}

/**
 * GPU-accelerated (`scaleX`) progress bar with optional Warm Amber sheen on mount/update.
 */
export const AnimatedProgressBar: React.FC<AnimatedProgressBarProps> = ({
  value,
  className,
  trackClassName,
  barClassName,
  label,
  shimmer = true,
}) => {
  const reduced = useAppReducedMotion();
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const rounded = Math.round(clamped);

  const [sheenKey, setSheenKey] = useState(0);
  const prevRoundedRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevRoundedRef.current !== rounded) {
      prevRoundedRef.current = rounded;
      if (!reduced && shimmer && clamped > 0) {
        setSheenKey((k) => k + 1);
      }
    }
  }, [rounded, reduced, shimmer, clamped]);

  return (
    <div
      role="progressbar"
      aria-valuenow={rounded}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cx(
        'relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-elevated,#393A35)]',
        trackClassName,
        className,
      )}
    >
      <m.div
        initial={{ scaleX: reduced ? clamped / 100 : 0 }}
        animate={{ scaleX: clamped / 100 }}
        transition={reduced ? REDUCED_MOTION_TRANSITION : MOTION_SPRINGS.gentle}
        style={{ originX: 0 }}
        className={cx(
          'h-full w-full rounded-full bg-gradient-to-r from-[#D88B45] to-[#E5A465]',
          barClassName,
        )}
      />

      {!reduced && shimmer && clamped > 0 && sheenKey > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 overflow-hidden rounded-full"
          style={{ width: `${clamped}%` }}
        >
          <m.div
            key={sheenKey}
            initial={{ x: '-100%', opacity: 0 }}
            animate={{ x: '220%', opacity: [0, 0.55, 0] }}
            transition={{ duration: 0.72, ease: MOTION_EASE.editorial }}
            className="h-full w-1/2 bg-gradient-to-r from-transparent via-[#FFF4E4]/50 to-transparent"
          />
        </div>
      )}
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* 5. AnimatedNumber                                                          */
/* -------------------------------------------------------------------------- */

export interface AnimatedNumberProps {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  /** Optional custom number formatter (defaults to `Math.round`) */
  format?: (latest: number) => string;
  /** If true, animates up from 0 on first mount (default: `false`) */
  animateOnMount?: boolean;
}

/**
 * Smooth spring-interpolated integer display for percentages and counters.
 */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  prefix = '',
  suffix = '',
  className,
  format,
  animateOnMount = false,
}) => {
  const reduced = useAppReducedMotion();
  const safeValue = Number.isFinite(value) ? value : 0;
  const initialValue = animateOnMount && !reduced ? 0 : safeValue;

  const spring = useSpring(initialValue, {
    stiffness: 260,
    damping: 28,
    mass: 0.8,
  });

  const display = useTransform(spring, (latest) => {
    const formatted = format ? format(latest) : String(Math.round(latest));
    return `${prefix}${formatted}${suffix}`;
  });

  useEffect(() => {
    if (reduced) {
      spring.jump(safeValue);
    } else {
      spring.set(safeValue);
    }
  }, [safeValue, reduced, spring]);

  return (
    <m.span className={cx('tabular-nums', className)}>
      {display}
    </m.span>
  );
};

/* -------------------------------------------------------------------------- */
/* 6. SwipeableDayContainer                                                   */
/* -------------------------------------------------------------------------- */

export interface SwipeableDayContainerProps {
  children: React.ReactNode;
  onPrevDay: () => void;
  onNextDay: () => void;
  disabled?: boolean;
  className?: string;
  /** Minimum horizontal drag distance in px to switch days (default: `56`) */
  offsetThreshold?: number;
  /** Minimum horizontal swipe velocity in px/s to switch days (default: `320`) */
  velocityThreshold?: number;
}

interface TouchGestureState {
  active: boolean;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  startTime: number;
  lockedAxis: 'none' | 'x' | 'y';
  velocityX: number;
}

const IDLE_GESTURE: TouchGestureState = {
  active: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastTime: 0,
  startTime: 0,
  lockedAxis: 'none',
  velocityX: 0,
};

/**
 * Mobile horizontal swipe container for day-by-day navigation.
 * Uses native touch events + `useMotionValue` (`domAnimation`-compatible, zero `domMax` weight)
 * with axis locking and `touch-action: pan-y` so vertical scrolling is never hijacked.
 */
export const SwipeableDayContainer: React.FC<SwipeableDayContainerProps> = ({
  children,
  onPrevDay,
  onNextDay,
  disabled = false,
  className,
  offsetThreshold = MOTION_SWIPE.offsetThreshold,
  velocityThreshold = MOTION_SWIPE.velocityThreshold,
}) => {
  const reduced = useAppReducedMotion();
  const x = useMotionValue(0);
  const gestureRef = useRef<TouchGestureState>({ ...IDLE_GESTURE });
  const snapAnimRef = useRef<ReturnType<typeof animate> | null>(null);

  useEffect(() => {
    if (disabled) {
      gestureRef.current.active = false;
      snapAnimRef.current?.stop();
      snapAnimRef.current = null;
      x.set(0);
    }
  }, [disabled, x]);

  useEffect(() => {
    return () => {
      snapAnimRef.current?.stop();
    };
  }, []);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (disabled || event.touches.length !== 1) {
      gestureRef.current.active = false;
      return;
    }

    snapAnimRef.current?.stop();
    snapAnimRef.current = null;

    const touch = event.touches[0];
    const now = performance.now();

    gestureRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
      lastX: touch.clientX,
      lastTime: now,
      startTime: now,
      lockedAxis: 'none',
      velocityX: 0,
    };
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const state = gestureRef.current;
    if (!state.active || disabled || event.touches.length !== 1) return;

    const touch = event.touches[0];
    const dx = touch.clientX - state.startX;
    const dy = touch.clientY - state.startY;

    if (state.lockedAxis === 'none') {
      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      if (absX < MOTION_SWIPE.directionLockSlop && absY < MOTION_SWIPE.directionLockSlop) {
        return;
      }
      if (absY >= absX) {
        state.lockedAxis = 'y';
        x.set(0);
        return;
      }
      state.lockedAxis = 'x';
    }

    if (state.lockedAxis === 'y') return;

    const now = performance.now();
    const dt = now - state.lastTime;
    if (dt > 0) {
      const instantVelocity = ((touch.clientX - state.lastX) / dt) * 1000;
      state.velocityX = state.velocityX * 0.4 + instantVelocity * 0.6;
      state.lastX = touch.clientX;
      state.lastTime = now;
    }

    if (!reduced) {
      const clamped = Math.max(
        -MOTION_SWIPE.maxDragOffset,
        Math.min(MOTION_SWIPE.maxDragOffset, dx * MOTION_SWIPE.dragResistance),
      );
      x.set(clamped);
    }
  };

  const finishTouch = (event: React.TouchEvent<HTMLDivElement>, cancelled: boolean) => {
    const state = gestureRef.current;
    if (!state.active) return;
    state.active = false;

    if (!cancelled && !disabled && state.lockedAxis === 'x') {
      const endX = event.changedTouches[0]?.clientX ?? state.lastX;
      const totalDx = endX - state.startX;
      const now = performance.now();
      const staleVelocity = now - state.lastTime > 100;
      const effectiveVelocity = staleVelocity
        ? 0
        : state.velocityX ||
          (now > state.startTime ? (totalDx / (now - state.startTime)) * 1000 : 0);

      if (Math.abs(totalDx) > MOTION_SWIPE.directionLockSlop) {
        if (totalDx > offsetThreshold || effectiveVelocity > velocityThreshold) {
          onPrevDay();
        } else if (totalDx < -offsetThreshold || effectiveVelocity < -velocityThreshold) {
          onNextDay();
        }
      }
    }

    snapAnimRef.current?.stop();
    if (reduced || x.get() === 0) {
      snapAnimRef.current = null;
      x.set(0);
    } else {
      snapAnimRef.current = animate(x, 0, MOTION_SPRINGS.tactile);
    }
  };

  return (
    <m.div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={(event) => finishTouch(event, false)}
      onTouchCancel={(event) => finishTouch(event, true)}
      style={{ x, touchAction: 'pan-y' }}
      className={className}
    >
      {children}
    </m.div>
  );
};
