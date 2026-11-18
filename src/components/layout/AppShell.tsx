import React from 'react';
import { Desktop, Moon, Sun, type Icon as PhosphorIcon } from '@phosphor-icons/react';
import type { ResolvedUserSettings, ThemeMode } from '../../types';
import { SidebarNav, type TabType } from './SidebarNav';

export interface AppShellProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
  settings: ResolvedUserSettings;
  onCycleTheme: () => void;
  deadlinesBadgeCount?: number;
  liveLessonName?: string;
  liveStatusLabel?: string;
  pageTitle?: string;
  headerActions?: React.ReactNode;
  banner?: React.ReactNode;
  bottomNav?: React.ReactNode;
  children: React.ReactNode;
}

const DEFAULT_TAB_TITLES: Record<TabType, string> = {
  schedule: 'Розклад занять',
  deadlines: 'Дедлайни та нотатки',
  stats: 'Відвідуваність',
  directory: 'Довідник',
  settings: 'Опції профілю',
};

const THEME_META: Record<ThemeMode, { label: string; Icon: PhosphorIcon }> = {
  dark: { label: 'Темна', Icon: Moon },
  light: { label: 'Світла', Icon: Sun },
  system: { label: 'Системна', Icon: Desktop },
};

export const AppShell: React.FC<AppShellProps> = ({
  currentTab,
  onTabChange,
  settings,
  onCycleTheme,
  deadlinesBadgeCount,
  liveLessonName,
  liveStatusLabel,
  pageTitle,
  headerActions,
  banner,
  bottomNav,
  children,
}) => {
  const resolvedTitle = pageTitle ?? DEFAULT_TAB_TITLES[currentTab];
  const themeMeta = THEME_META[settings.theme];
  const ThemeIcon = themeMeta.Icon;

  return (
    <div className="min-h-screen bg-canvas text-ink selection:bg-amber/25 selection:text-ink">
      {/* Skip-to-content accessibility link */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[60] focus:inline-flex focus:items-center focus:rounded-xl focus:border focus:border-amber/60 focus:bg-surface-elevated focus:px-3.5 focus:py-2 focus:text-xs focus:font-semibold focus:text-ink focus:shadow-glass"
      >
        Перейти до вмісту
      </a>

      {/* Desktop Left Sidebar (lg+) */}
      <SidebarNav
        currentTab={currentTab}
        onTabChange={onTabChange}
        settings={settings}
        onCycleTheme={onCycleTheme}
        deadlinesBadgeCount={deadlinesBadgeCount}
        liveLessonName={liveLessonName}
        liveStatusLabel={liveStatusLabel}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 xl:pl-[272px] min-h-screen flex flex-col">
        {banner}

        <main
          id="main-content"
          tabIndex={-1}
          className="relative flex-1 w-full max-w-7xl mx-auto px-3 xs:px-4 lg:px-8 pt-[max(1rem,calc(env(safe-area-inset-top)+0.5rem))] pb-28 lg:pt-6 lg:pb-10 focus:outline-none"
        >
          <h1 className="sr-only">{resolvedTitle}</h1>

          {/* Quick theme toggle on mobile/tablet where sidebar is hidden */}
          <div className="lg:hidden absolute top-[max(0.875rem,calc(env(safe-area-inset-top)+0.375rem))] right-3 xs:right-4 z-20 flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={onCycleTheme}
              aria-label={`Тема оформлення: ${themeMeta.label}. Натисніть, щоб змінити`}
              title={`Тема: ${themeMeta.label}`}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface/90 text-ink shadow-elevated backdrop-blur-md transition-colors duration-150 hover:border-line-strong hover:bg-surface-elevated active:scale-[0.97]"
            >
              <ThemeIcon className="h-4 w-4 text-amber-fg shrink-0" weight="duotone" aria-hidden="true" />
            </button>
          </div>

          {children}
        </main>
      </div>

      {/* Mobile / Tablet Bottom Dock Slot */}
      {bottomNav}
    </div>
  );
};
