import React from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
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
  contextKicker?: string;
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

const THEME_META: Record<ThemeMode, { label: string; Icon: LucideIcon }> = {
  dark: { label: 'Темна', Icon: Moon },
  light: { label: 'Світла', Icon: Sun },
  system: { label: 'Системна', Icon: Monitor },
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
  contextKicker,
  headerActions,
  banner,
  bottomNav,
  children,
}) => {
  const resolvedTitle = pageTitle ?? DEFAULT_TAB_TITLES[currentTab];
  const resolvedKicker =
    contextKicker ??
    `ФЕП-33с · ${settings.department.toUpperCase()} · Підгр. ${settings.subgroup}`;
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

        <header className="sticky top-0 z-20 glass-panel border-x-0 border-t-0 border-b border-line-glass pt-safe">
          <div className="w-full max-w-7xl mx-auto px-3 xs:px-4 lg:px-8 py-2.5 lg:py-3 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <img
                  src="/icons/icon-192.png"
                  alt=""
                  width={18}
                  height={18}
                  className="lg:hidden h-[18px] w-[18px] shrink-0 rounded border border-line/70 object-cover"
                />
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-amber-fg truncate">
                  {resolvedKicker}
                </span>
              </div>
              <h1 className="mt-0.5 text-[19px] lg:text-[22px] font-bold leading-[1.2] tracking-[-0.02em] text-ink truncate">
                {resolvedTitle}
              </h1>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {headerActions}

              {/* Quick theme toggle on mobile/tablet where sidebar is hidden */}
              <button
                type="button"
                onClick={onCycleTheme}
                aria-label={`Тема оформлення: ${themeMeta.label}. Натисніть, щоб змінити`}
                title={`Тема: ${themeMeta.label}`}
                className="lg:hidden inline-flex h-10 min-w-[40px] items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-elevated/80 px-2.5 text-xs font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-surface-elevated active:scale-[0.97]"
              >
                <ThemeIcon className="h-4 w-4 text-amber-fg shrink-0" aria-hidden="true" />
                <span className="hidden xs:inline font-mono text-[11px]">
                  {themeMeta.label}
                </span>
              </button>
            </div>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 w-full max-w-7xl mx-auto px-3 xs:px-4 lg:px-8 pt-4 pb-28 lg:pb-10 focus:outline-none"
        >
          {children}
        </main>
      </div>

      {/* Mobile / Tablet Bottom Dock Slot */}
      {bottomNav}
    </div>
  );
};
