import React from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import {
  Calendar,
  ChartBar,
  CheckSquare,
  Gear,
  Users,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import {
  resolveTransition,
  useAppReducedMotion,
} from '../../lib/motion';
import { cn } from '../../utils/cn';

export type TabType = 'schedule' | 'deadlines' | 'stats' | 'directory' | 'settings';

export interface BottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  deadlinesBadgeCount?: number;
  enterDelay?: number;
}

interface NavTabItem {
  id: TabType;
  label: string;
  icon: PhosphorIcon;
}

const NAV_TABS: readonly NavTabItem[] = [
  { id: 'schedule', label: 'Розклад', icon: Calendar },
  { id: 'deadlines', label: 'Дедлайни', icon: CheckSquare },
  { id: 'stats', label: 'Статистика', icon: ChartBar },
  { id: 'directory', label: 'Довідник', icon: Users },
  { id: 'settings', label: 'Опції', icon: Gear },
] as const;

const CAPSULE_SPRING = {
  type: 'spring' as const,
  stiffness: 420,
  damping: 30,
  mass: 0.8,
};

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  deadlinesBadgeCount = 0,
  enterDelay = 0.38,
}) => {
  const reducedMotion = useAppReducedMotion();
  const indicatorTransition = resolveTransition(CAPSULE_SPRING, reducedMotion);

  const hasDeadlinesBadge = deadlinesBadgeCount > 0;
  const formattedBadgeCount =
    deadlinesBadgeCount > 99 ? '99+' : String(deadlinesBadgeCount);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-[4%] pb-[max(0.75rem,calc(env(safe-area-inset-bottom)+0.375rem))] lg:hidden">
      <LayoutGroup id="mobile-bottom-nav">
        <motion.nav
          aria-label="Мобільна навігація"
          initial={reducedMotion ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reducedMotion
              ? { duration: 0.01 }
              : { duration: 0.32, delay: enterDelay, ease: [0.22, 1, 0.36, 1] }
          }
          className="pointer-events-auto flex h-[58px] w-full max-w-[400px] items-center justify-between gap-1 rounded-full border border-line bg-surface-elevated px-2 shadow-[0_8px_24px_rgba(0,0,0,0.22)]"
        >
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
                  'group relative flex h-11 min-h-[44px] min-w-[44px] flex-1 items-center justify-center rounded-full transition-colors select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber/60',
                  isActive
                    ? 'text-amber-fg'
                    : 'text-ink-secondary hover:text-ink'
                )}
              >
                {isActive && (
                  <motion.span
                    layoutId="mobileNavIndicator"
                    transition={indicatorTransition}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-1 inset-y-0.5 rounded-full border border-amber/25 bg-amber-soft"
                  />
                )}

                <span className="relative z-10 flex items-center justify-center">
                  <Icon
                    className="h-[25px] w-[25px] shrink-0 transition-colors"
                    weight={isActive ? 'fill' : 'regular'}
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
      </LayoutGroup>
    </div>
  );
};
