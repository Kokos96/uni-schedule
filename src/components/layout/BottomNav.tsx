import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarBlank,
  ChartBar,
  CheckSquare,
  Gear,
  Users,
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
  { id: 'directory', label: 'Довідник', icon: Users },
  { id: 'settings', label: 'Опції', icon: Gear },
] as const;

const INDICATOR_SPRING = {
  type: 'spring' as const,
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

const DOCK_SPRING = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 32,
  mass: 0.8,
};

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  deadlinesBadgeCount = 0,
  visible = true,
}) => {
  const reducedMotion = useAppReducedMotion();
  const isCompact = useScrollCompact({ resetKey: currentTab });

  const navRef = useRef<HTMLElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null);
  const hasMeasuredRef = useRef(false);

  const activeIndex = NAV_TABS.findIndex((t) => t.id === currentTab);

  const measureIndicator = useCallback(() => {
    const activeBtn = activeIndex >= 0 ? tabRefs.current[activeIndex] : null;
    if (!activeBtn) return;
    const inset = isCompact ? 3 : 4;
    const next = {
      left: activeBtn.offsetLeft + inset,
      width: Math.max(36, activeBtn.offsetWidth - inset * 2),
    };
    setIndicator((prev) =>
      prev && prev.left === next.left && prev.width === next.width ? prev : next
    );
    hasMeasuredRef.current = true;
  }, [activeIndex, isCompact]);

  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator]);

  useEffect(() => {
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureIndicator());
    ro.observe(el);
    return () => ro.disconnect();
  }, [measureIndicator]);

  const hasDeadlinesBadge = deadlinesBadgeCount > 0;
  const formattedBadgeCount =
    deadlinesBadgeCount > 99 ? '99+' : String(deadlinesBadgeCount);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-[4%] pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.375rem))] lg:hidden">
      <motion.nav
        ref={navRef}
        aria-label="Мобільна навігація"
        data-dock-state={isCompact ? 'compact' : 'expanded'}
        initial={reducedMotion ? false : { opacity: 0, y: 22 }}
        animate={{
          opacity: visible ? 1 : 0,
          y: visible ? 0 : 22,
          height: isCompact ? 50 : 56,
          maxWidth: isCompact ? 336 : 400,
        }}
        transition={reducedMotion ? { duration: 0.05 } : DOCK_SPRING}
        className={cn(
          'pointer-events-auto relative flex w-full items-center justify-between rounded-full border border-line bg-surface-elevated shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition-[padding] duration-200',
          isCompact ? 'px-1.5 gap-0.5' : 'px-2 gap-1'
        )}
      >
        {indicator && (
          <motion.span
            aria-hidden="true"
            data-testid="mobile-nav-indicator"
            initial={false}
            animate={{ x: indicator.left, width: indicator.width }}
            transition={
              reducedMotion || !hasMeasuredRef.current
                ? { duration: 0.01 }
                : INDICATOR_SPRING
            }
            className="pointer-events-none absolute top-1 bottom-1 left-0 rounded-full border border-amber/20 bg-amber-soft"
          />
        )}

        {NAV_TABS.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          const showBadge = tab.id === 'deadlines' && hasDeadlinesBadge;
          const accessibleLabel = showBadge
            ? `${tab.label} (${deadlinesBadgeCount} активних)`
            : tab.label;

          return (
            <motion.button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              type="button"
              onClick={() => onTabChange(tab.id)}
              whileTap={reducedMotion ? undefined : { scale: 0.92 }}
              aria-label={accessibleLabel}
              title={tab.label}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative z-10 flex h-11 min-h-[44px] min-w-[44px] flex-1 items-center justify-center rounded-full transition-colors select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60',
                isActive
                  ? 'text-amber-fg'
                  : 'text-ink-secondary hover:text-ink'
              )}
            >
              <span className="relative z-10 flex items-center justify-center">
                <Icon
                  className={cn(
                    'shrink-0 transition-[width,height,color] duration-200',
                    isCompact ? 'h-[21px] w-[21px]' : 'h-[23px] w-[23px]'
                  )}
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
              </span>
            </motion.button>
          );
        })}
      </motion.nav>
    </div>
  );
};
