import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import {
  AddressBook,
  ArrowRight,
  Calendar,
  ChartPieSlice,
  CheckSquare,
  Desktop,
  Gear,
  Moon,
  Sun,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ResolvedUserSettings, ThemeMode } from '../../types';
import { MOTION_SPRINGS, resolveTransition, useAppReducedMotion } from '../../lib/motion';
import { StatusDot } from '../ui/Badge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type TabType = 'schedule' | 'deadlines' | 'stats' | 'directory' | 'settings';

export interface SidebarNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  settings: ResolvedUserSettings;
  onCycleTheme: () => void;
  deadlinesBadgeCount?: number;
  liveLessonName?: string;
  liveStatusLabel?: string;
}

interface NavItemConfig {
  id: TabType;
  label: string;
  Icon: PhosphorIcon;
  shortcut: string;
}

const NAV_ITEMS: readonly NavItemConfig[] = [
  { id: 'schedule', label: 'Розклад', Icon: Calendar, shortcut: '1' },
  { id: 'deadlines', label: 'Дедлайни', Icon: CheckSquare, shortcut: '2' },
  { id: 'stats', label: 'Статистика', Icon: ChartPieSlice, shortcut: '3' },
  { id: 'directory', label: 'Довідник', Icon: AddressBook, shortcut: '4' },
  { id: 'settings', label: 'Опції', Icon: Gear, shortcut: '5' },
];

const THEME_LABELS: Record<ThemeMode, { label: string; Icon: PhosphorIcon }> = {
  dark: { label: 'Темна', Icon: Moon },
  light: { label: 'Світла', Icon: Sun },
  system: { label: 'Системна', Icon: Desktop },
};

function formatDeadlineCountUa(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) {
    return `${count} активних`;
  }
  if (mod10 === 1) {
    return `${count} активний`;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return `${count} активні`;
  }
  return `${count} активних`;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  currentTab,
  onTabChange,
  settings,
  onCycleTheme,
  deadlinesBadgeCount = 0,
  liveLessonName,
  liveStatusLabel,
}) => {
  const reducedMotion = useAppReducedMotion();
  const navButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const themeMeta = THEME_LABELS[settings.theme];
  const ThemeIcon = themeMeta.Icon;

  const hasLiveLesson = Boolean(liveLessonName && liveLessonName.trim().length > 0);
  const isBreakOrLive = Boolean(
    liveStatusLabel &&
      /(зараз|триває|перерва|далі)/i.test(liveStatusLabel)
  );

  const handleNavKeyDown = (
    e: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    let nextIndex: number | null = null;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      nextIndex = (index + 1) % NAV_ITEMS.length;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      nextIndex = (index - 1 + NAV_ITEMS.length) % NAV_ITEMS.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = NAV_ITEMS.length - 1;
    }

    if (nextIndex !== null) {
      const target = NAV_ITEMS[nextIndex];
      if (target) {
        onTabChange(target.id);
        navButtonRefs.current[nextIndex]?.focus();
      }
    }
  };

  return (
    <aside
      aria-label="Бічна навігація"
      className="hidden lg:flex lg:w-64 xl:w-[272px] lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 z-30 glass-panel border-y-0 border-l-0 border-r border-line-glass"
    >
      {/* Brand Header */}
      <div className="px-4 pt-5 pb-4 border-b border-line/60">
        <div className="flex items-center gap-2.5">
          <img
            src="/icons/icon-192.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 rounded-lg object-cover shadow-elevated"
          />
          <div className="min-w-0 flex-1">
            <span className="block font-serif text-[16px] font-bold leading-tight tracking-[-0.02em] text-ink">
              Розклад
            </span>
          </div>
        </div>

        <div className="mt-3">
          <span className="inline-flex items-center rounded-md border border-line bg-surface-elevated/85 px-2 py-0.5 font-mono text-[10.5px] font-semibold tracking-[0.04em] text-ink-secondary">
            ФЕП-33с · {settings.department.toUpperCase()} · Підгр. {settings.subgroup}
          </span>
        </div>
      </div>

      {/* Primary Navigation */}
      <nav aria-label="Розділи додатку" className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {NAV_ITEMS.map((item, index) => {
          const isActive = currentTab === item.id;
          const Icon = item.Icon;
          const showDeadlinesBadge = item.id === 'deadlines' && deadlinesBadgeCount > 0;

          return (
            <button
              key={item.id}
              ref={(el) => {
                navButtonRefs.current[index] = el;
              }}
              type="button"
              onClick={() => onTabChange(item.id)}
              onKeyDown={(e) => handleNavKeyDown(e, index)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group relative flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-colors duration-150 active:scale-[0.98]',
                isActive
                  ? 'text-ink'
                  : 'text-ink-secondary hover:bg-surface-elevated/55 hover:text-ink'
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="desktopNavPill"
                  transition={resolveTransition(MOTION_SPRINGS.tactile, reducedMotion)}
                  className="glass-amber-lit absolute inset-0 rounded-xl"
                  aria-hidden="true"
                />
              )}

              <span className="relative z-10 flex min-w-0 items-center gap-2.5">
                <Icon
                  className={cn(
                    'h-[18px] w-[18px] shrink-0 transition-colors duration-150',
                    isActive
                      ? 'text-amber-fg'
                      : 'text-ink-secondary group-hover:text-ink'
                  )}
                  weight={isActive ? 'duotone' : 'regular'}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </span>

              <span className="relative z-10 flex items-center gap-1.5">
                {showDeadlinesBadge && (
                  <span
                    className={cn(
                      'inline-flex min-w-[20px] items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-semibold tabular-nums leading-none',
                      isActive
                        ? 'bg-amber text-[#242522]'
                        : 'border border-terracotta/35 bg-terracotta-soft text-terracotta-fg'
                    )}
                    aria-label={`Активних дедлайнів: ${deadlinesBadgeCount}`}
                  >
                    {deadlinesBadgeCount > 99 ? '99+' : deadlinesBadgeCount}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Contextual Sidebar Widgets & Quick Theme Toggle */}
      <div className="px-3 pb-4 pt-3 border-t border-line/60 space-y-2.5">
        {/* Live Pair Status Widget */}
        <button
          type="button"
          onClick={() => onTabChange('schedule')}
          className={cn(
            'w-full rounded-xl p-3 text-left transition-all duration-150 active:scale-[0.985]',
            hasLiveLesson
              ? 'glass-amber-lit hover:border-amber/60'
              : 'border border-line bg-surface/75 hover:border-line-strong hover:bg-surface-elevated/60'
          )}
        >
          <div className="flex items-center gap-2">
            <StatusDot
              tone={hasLiveLesson ? 'amber' : 'neutral'}
              pulse={hasLiveLesson && isBreakOrLive}
              size="sm"
            />
            <span
              className={cn(
                'font-mono text-[10px] font-semibold uppercase tracking-[0.06em] truncate',
                hasLiveLesson ? 'text-amber-fg' : 'text-ink-secondary'
              )}
            >
              {liveStatusLabel ?? (hasLiveLesson ? 'Зараз триває' : 'Вільний день')}
            </span>
          </div>
          <p className="mt-1.5 text-[13px] font-medium leading-snug text-ink line-clamp-2">
            {hasLiveLesson ? liveLessonName : 'Наразі активних пар немає'}
          </p>
        </button>

        {/* Upcoming Deadlines Summary */}
        <button
          type="button"
          onClick={() => onTabChange('deadlines')}
          className="group flex w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface/75 px-3 py-2.5 text-left transition-colors duration-150 hover:border-line-strong hover:bg-surface-elevated/60 active:scale-[0.985]"
        >
          <div className="min-w-0">
            <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
              Дедлайни
            </span>
            <span className="mt-0.5 block text-xs font-medium text-ink truncate">
              {deadlinesBadgeCount > 0
                ? formatDeadlineCountUa(deadlinesBadgeCount)
                : 'Усе виконано'}
            </span>
          </div>
          <span
            className={cn(
              'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150',
              deadlinesBadgeCount > 0
                ? 'border-amber/35 bg-amber-soft text-amber-fg group-hover:border-amber/60'
                : 'border-line bg-surface-elevated text-ink-secondary group-hover:text-ink'
            )}
            aria-hidden="true"
          >
            <ArrowRight className="h-3.5 w-3.5" weight="regular" />
          </span>
        </button>

        {/* Quick Theme Toggle */}
        <button
          type="button"
          onClick={onCycleTheme}
          aria-label={`Тема оформлення: ${themeMeta.label}. Натисніть, щоб змінити`}
          className="flex w-full items-center justify-between rounded-xl border border-line bg-surface-elevated/70 px-3 py-2 text-xs font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-surface-elevated active:scale-[0.985]"
        >
          <span className="flex items-center gap-2 text-ink-secondary">
            <ThemeIcon className="h-3.5 w-3.5 text-amber-fg" weight="duotone" aria-hidden="true" />
            <span>Тема</span>
          </span>
          <span className="font-mono text-[11px] font-semibold text-ink">
            {themeMeta.label}
          </span>
        </button>
      </div>
    </aside>
  );
};
