import React from 'react';
import { motion } from 'framer-motion';
import {
  BarChart3,
  Calendar,
  CheckSquare,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import {
  MOTION_SPRINGS,
  resolveTransition,
  useAppReducedMotion,
} from '../../lib/motion';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type TabType = 'schedule' | 'deadlines' | 'stats' | 'directory' | 'settings';

export interface BottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  deadlinesBadgeCount?: number;
}

interface NavTabItem {
  id: TabType;
  label: string;
  icon: LucideIcon;
}

const NAV_TABS: readonly NavTabItem[] = [
  { id: 'schedule', label: 'Розклад', icon: Calendar },
  { id: 'deadlines', label: 'Дедлайни', icon: CheckSquare },
  { id: 'stats', label: 'Статистика', icon: BarChart3 },
  { id: 'directory', label: 'Довідник', icon: Users },
  { id: 'settings', label: 'Опції', icon: Settings },
] as const;

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onTabChange,
  deadlinesBadgeCount = 0,
}) => {
  const reducedMotion = useAppReducedMotion();
  const indicatorTransition = resolveTransition(MOTION_SPRINGS.snappy, reducedMotion);

  const hasDeadlinesBadge = deadlinesBadgeCount > 0;
  const formattedBadgeCount =
    deadlinesBadgeCount > 99 ? '99+' : String(deadlinesBadgeCount);

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 lg:hidden glass-strong border-x-0 border-b-0 border-t border-line-glass pb-safe">
      <nav
        aria-label="Мобільна навігація"
        className="mx-auto flex h-14 max-w-lg items-center justify-between gap-0.5 px-1.5 xs:px-2"
      >
        {NAV_TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          const showBadge = tab.id === 'deadlines' && hasDeadlinesBadge;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex min-h-[46px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1 transition-colors select-none',
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
                  className="pointer-events-none absolute inset-x-0.5 inset-y-0.5 rounded-xl border border-amber/30 bg-amber-soft shadow-[inset_0_1px_0_rgba(216,139,69,0.2)]"
                >
                  <span className="absolute top-0 left-1/2 h-[2.5px] w-6 -translate-x-1/2 rounded-full bg-amber" />
                </motion.span>
              )}

              <span className="relative z-10 flex items-center justify-center">
                <Icon
                  className="h-[19px] w-[19px] shrink-0 transition-colors"
                  strokeWidth={isActive ? 2.25 : 1.75}
                  aria-hidden
                />
                {showBadge && (
                  <span
                    aria-hidden
                    style={{
                      backgroundColor: 'var(--status-absent-bg)',
                      color: 'var(--status-absent-fg)',
                    }}
                    className="absolute -top-1.5 -right-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 font-mono text-[9px] font-bold leading-none tabular-nums ring-2 ring-[var(--bg-surface)]"
                  >
                    {formattedBadgeCount}
                  </span>
                )}
              </span>

              <span
                className={cn(
                  'relative z-10 max-w-full truncate whitespace-nowrap text-[10px] xs:text-[11px] leading-tight tracking-[-0.01em] transition-colors',
                  isActive ? 'font-semibold' : 'font-medium'
                )}
              >
                {tab.label}
              </span>

              {showBadge && (
                <span className="sr-only">
                  ({deadlinesBadgeCount} активних)
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
};
