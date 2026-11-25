import React, { useEffect, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import {
  AddressBook,
  CalendarBlank,
  ChartBar,
  CheckSquare,
  GearSix,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useScrollCompact } from '../../hooks/useScrollCompact';
import { useAppReducedMotion } from '../../lib/motion';
import { cn } from '../../utils/cn';

export type TabType = 'schedule' | 'deadlines' | 'stats' | 'directory' | 'settings';

export interface BottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  deadlinesBadgeCount?: number;
  visible?: boolean;
}

interface NavTabItem {
  id: TabType;
  label: string;
  icon: PhosphorIcon;
}

const NAV_TABS: readonly NavTabItem[] = [
  { id: 'schedule', label: 'Розклад', icon: CalendarBlank },
  { id: 'deadlines', label: 'Дедлайни', icon: CheckSquare },
  { id: 'stats', label: 'Статистика', icon: ChartBar },
  { id: 'directory', label: 'Довідник', icon: AddressBook },
  { id: 'settings', label: 'Опції', icon: GearSix },
] as const;

const DOCK_SPRING = {
  stiffness: 380,
  damping: 34,
  mass: 0.78,
};

const INDICATOR_SPRING = {
  stiffness: 420,
  damping: 34,
  mass: 0.75,
};

function computeDockBounds(viewportWidth: number): { expanded: number; compact: number } {
  const safeVw = Math.max(320, viewportWidth);
  const expanded = Math.round(Math.min(safeVw - 32, 358));
  const compact = Math.round(Math.max(264, Math.min(expanded - 50, 306)));
  return { expanded, compact };
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  deadlinesBadgeCount = 0,
  visible = true,
}) => {
  const reducedMotion = useAppReducedMotion();
  const isCompact = useScrollCompact({ resetKey: currentTab });

  const [viewportWidth, setViewportWidth] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 390
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const activeIndex = Math.max(
    0,
    NAV_TABS.findIndex((t) => t.id === currentTab)
  );

  // Single coordinated geometry progress model:
  // `compactProgress` (0 = expanded, 1 = compact) drives capsule width, height,
  // horizontal padding, and icon scale synchronously without ResizeObserver lag.
  const compactProgress = useSpring(isCompact ? 1 : 0, DOCK_SPRING);
  const activeIndexSpring = useSpring(activeIndex, INDICATOR_SPRING);

  useEffect(() => {
    if (reducedMotion) {
      compactProgress.jump(isCompact ? 1 : 0);
    } else {
      compactProgress.set(isCompact ? 1 : 0);
    }
  }, [isCompact, reducedMotion, compactProgress]);

  useEffect(() => {
    if (reducedMotion) {
      activeIndexSpring.jump(activeIndex);
    } else {
      activeIndexSpring.set(activeIndex);
    }
  }, [activeIndex, reducedMotion, activeIndexSpring]);

  const bounds = computeDockBounds(viewportWidth);
  const dockWidth = useTransform(compactProgress, [0, 1], [bounds.expanded, bounds.compact]);
  const dockHeight = useTransform(compactProgress, [0, 1], [58, 52]);
  const trackPaddingX = useTransform(compactProgress, [0, 1], [6, 5]);
  const iconScale = useTransform(compactProgress, [0, 1], [1, 0.9]);
  // Normalized local coordinate inside the 5-column equal grid: each slot is 100% of indicator width.
  const indicatorX = useTransform(activeIndexSpring, (i) => `${i * 100}%`);

  const hasDeadlinesBadge = deadlinesBadgeCount > 0;
  const formattedBadgeCount =
    deadlinesBadgeCount > 99 ? '99+' : String(deadlinesBadgeCount);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.375rem))] lg:hidden">
      <motion.nav
        aria-label="Мобільна навігація"
        data-dock-state={isCompact ? 'compact' : 'expanded'}
        initial={reducedMotion ? false : { opacity: 0, y: 24 }}
        animate={{
          opacity: visible ? 1 : 0,
          y: visible ? 0 : 24,
        }}
        transition={
          reducedMotion
            ? { duration: 0.05 }
            : { type: 'spring', stiffness: 360, damping: 32, mass: 0.8 }
        }
        style={{
          width: dockWidth,
          height: dockHeight,
          paddingLeft: trackPaddingX,
          paddingRight: trackPaddingX,
        }}
        className={cn(
          'relative flex items-center rounded-full border border-line/90 bg-surface-elevated shadow-[0_10px_28px_rgba(0,0,0,0.20)]',
          visible ? 'pointer-events-auto' : 'pointer-events-none'
        )}
      >
        {/* Normalized 5-column track keeps indicator mathematically locked during width morphs */}
        <div className="relative grid h-full w-full grid-cols-5 items-center">
          <motion.span
            aria-hidden="true"
            data-testid="mobile-nav-indicator"
            style={{
              width: `${100 / NAV_TABS.length}%`,
              x: indicatorX,
            }}
            className="pointer-events-none absolute inset-y-[5px] left-0 px-[2px]"
          >
            <span className="block h-full w-full rounded-full border border-amber/20 bg-amber-soft" />
          </motion.span>

          {NAV_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentTab === tab.id;
            const showBadge = tab.id === 'deadlines' && hasDeadlinesBadge;
            const accessibleLabel = showBadge
              ? `${tab.label} (${deadlinesBadgeCount} активних)`
              : tab.label;

            return (
              <motion.button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                whileTap={reducedMotion ? undefined : { scale: 0.92 }}
                aria-label={accessibleLabel}
                title={tab.label}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'group relative z-10 flex h-full min-h-[44px] min-w-[44px] w-full items-center justify-center rounded-full transition-colors select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60',
                  isActive
                    ? 'text-amber-fg'
                    : 'text-ink-secondary hover:text-ink'
                )}
              >
                <motion.span
                  style={{ scale: iconScale }}
                  className="relative z-10 flex items-center justify-center"
                >
                  <Icon
                    className="h-[22px] w-[22px] shrink-0 transition-colors duration-150"
                    weight={isActive ? 'duotone' : 'regular'}
                    aria-hidden
                  />
                  {showBadge && (
                    <span
                      aria-hidden
                      style={{
                        backgroundColor: 'var(--status-absent-bg)',
                        color: 'var(--status-absent-fg)',
                      }}
                      className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold leading-none tabular-nums ring-2 ring-[var(--bg-surface-elevated)]"
                    >
                      {formattedBadgeCount}
                    </span>
                  )}
                </motion.span>
              </motion.button>
            );
          })}
        </div>
      </motion.nav>
    </div>
  );
};
