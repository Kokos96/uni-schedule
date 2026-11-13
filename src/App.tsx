import React, {
  Component,
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  Warning,
} from '@phosphor-icons/react';
import { AppShell } from './components/layout/AppShell';
import { BottomNav, type TabType } from './components/layout/BottomNav';
import { OfflineBanner } from './components/layout/OfflineBanner';
import {
  AppMotionProvider,
  PageTransition,
} from './components/motion/MotionPrimitives';
import { ScheduleView } from './components/schedule/ScheduleView';
import { WeekStrip } from './components/schedule/WeekStrip';
import type { BackupImportMeta } from './components/settings/BackupSection';
import { GlassCard } from './components/ui/GlassCard';
import { ToastProvider, useToast } from './components/ui/Toast';
import { useAttendance } from './hooks/useAttendance';
import { useCurrentPair } from './hooks/useCurrentPair';
import { useDeadlines } from './hooks/useDeadlines';
import { useNotes } from './hooks/useNotes';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import type { Lesson, ThemeMode } from './types';
import type { UniScheduleBackupData } from './types/backup';
import {
  addDays,
  formatIsoDate,
  formatShortDateUa,
  getScheduleDayNumber,
  getWeekDates,
  getWeekParity,
  isSameDay,
  parseIsoDate,
} from './utils/date';
import {
  buildWeekGrid,
  classroomsData,
  classroomsMap,
  filterLessons,
  getClassroomById,
  getDayLessons,
  getTeacherById,
  scheduleData,
  teachersData,
  teachersMap,
} from './utils/schedule';
import type { StorageErrorCode } from './utils/storage';

const WeekGrid = lazy(() =>
  import('./components/schedule/WeekGrid').then((m) => ({
    default: m.WeekGrid,
  }))
);
const LessonNotesDrawer = lazy(() =>
  import('./components/schedule/LessonNotesDrawer').then((m) => ({
    default: m.LessonNotesDrawer,
  }))
);
const DeadlinesView = lazy(() =>
  import('./components/deadlines/DeadlinesView').then((m) => ({
    default: m.DeadlinesView,
  }))
);
const StatsView = lazy(() =>
  import('./components/stats/StatsView').then((m) => ({
    default: m.StatsView,
  }))
);
const DirectoryView = lazy(() =>
  import('./components/directory/DirectoryView').then((m) => ({
    default: m.DirectoryView,
  }))
);
const SettingsView = lazy(() =>
  import('./components/settings/SettingsView').then((m) => ({
    default: m.SettingsView,
  }))
);

const TAB_ORDER: Record<TabType, number> = {
  schedule: 0,
  deadlines: 1,
  stats: 2,
  directory: 3,
  settings: 4,
};

const THEME_CYCLE: Record<ThemeMode, ThemeMode> = {
  dark: 'light',
  light: 'system',
  system: 'dark',
};

const STORAGE_ERROR_MESSAGES: Record<StorageErrorCode, string> = {
  quota_exceeded: 'Перевищено ліміт локального сховища браузера. Зробіть резервну копію.',
  unavailable: 'Локальне сховище недоступне — зміни можуть не зберегтися після закриття.',
  unknown: 'Не вдалося зберегти дані у локальне сховище браузера.',
};

interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  public state: RootErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || null,
    };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled application error:', error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-4">
        <GlassCard
          variant="glass-strong"
          brackets
          padding="lg"
          className="w-full max-w-md space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-terracotta/40 bg-terracotta-soft text-terracotta-fg">
              <Warning className="h-5 w-5" weight="duotone" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-amber-fg">
                uni-schedule 2.0
              </span>
              <h1 className="mt-0.5 font-serif text-xl font-medium text-ink">
                Виникла непередбачена помилка
              </h1>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-ink-secondary">
            Інтерфейс зіткнувся з неочікуваним збоєм. Ваші відмітки, нотатки та
            дедлайни збережені локально — перезавантажте сторінку для відновлення
            роботи.
          </p>

          {this.state.errorMessage && (
            <div className="rounded-xl border border-line bg-surface-elevated/65 px-3 py-2 font-mono text-[11px] text-ink-secondary break-words">
              {this.state.errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber px-4 text-sm font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <ArrowCounterClockwise className="h-4 w-4 shrink-0" weight="regular" aria-hidden="true" />
            <span>Перезавантажити застосунок</span>
          </button>
        </GlassCard>
      </div>
    );
  }
}

const ViewSkeleton: React.FC = () => (
  <div
    aria-busy="true"
    aria-label="Завантаження розділу"
    className="space-y-5"
  >
    <div className="space-y-2.5">
      <div className="h-5 w-32 rounded-lg bg-surface-elevated/80 animate-pulse" />
      <div className="h-8 w-56 rounded-xl bg-surface-elevated/90 animate-pulse" />
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <GlassCard variant="glass" padding="lg" className="lg:col-span-7 space-y-3">
        <div className="h-5 w-40 rounded-lg bg-surface-elevated/80 animate-pulse" />
        <div className="h-24 w-full rounded-xl bg-surface-elevated/60 animate-pulse" />
        <div className="h-16 w-full rounded-xl bg-surface-elevated/50 animate-pulse" />
      </GlassCard>

      <GlassCard variant="matte" padding="lg" className="lg:col-span-5 space-y-3">
        <div className="h-5 w-36 rounded-lg bg-surface-elevated/80 animate-pulse" />
        <div className="h-20 w-full rounded-xl bg-surface-elevated/60 animate-pulse" />
        <div className="h-12 w-full rounded-xl bg-surface-elevated/50 animate-pulse" />
      </GlassCard>
    </div>
  </div>
);

const AppContent: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [tabDirection, setTabDirection] = useState<number>(0);

  const [todayDate, setTodayDate] = useState<Date>(() => new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const {
    settings,
    updateSettings,
    resetSettings,
    storageError: settingsStorageError,
  } = useSettings();
  useTheme(settings.theme);

  const {
    records,
    toggleAttendance,
    getStatus,
    replaceRecords,
    mergeRecords,
    clearRecords,
    storageError: attendanceStorageError,
  } = useAttendance();

  const {
    notes,
    saveNote,
    deleteNote,
    getNotesForLesson,
    replaceNotes,
    mergeNotes,
    clearNotes,
    storageError: notesStorageError,
  } = useNotes();

  const {
    deadlines,
    activeCount,
    overdueCount,
    addDeadline,
    toggleDeadline,
    updateDeadline,
    deleteDeadline,
    replaceDeadlines,
    mergeDeadlines,
    clearDeadlines,
    storageError: deadlinesStorageError,
  } = useDeadlines();

  const { isOnline, updateAvailable, applyUpdate, dismissUpdate } =
    useOnlineStatus();

  const [notesDrawerTarget, setNotesDrawerTarget] = useState<{
    lesson: Lesson;
    dateIso: string;
  } | null>(null);
  const [hasOpenedNotesDrawer, setHasOpenedNotesDrawer] = useState(false);

  const todayIso = useMemo(() => formatIsoDate(todayDate), [todayDate]);
  const selectedIso = useMemo(() => formatIsoDate(selectedDate), [selectedDate]);
  const isToday = selectedIso === todayIso;

  // Keep todayDate fresh across midnight rollovers and tab/app wakeups
  useEffect(() => {
    const syncToday = () => {
      const now = new Date();
      setTodayDate((prev) => (isSameDay(prev, now) ? prev : now));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncToday();
      }
    };

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
      0
    );
    const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());
    const midnightTimer = window.setTimeout(syncToday, msUntilMidnight);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', syncToday);

    return () => {
      window.clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', syncToday);
    };
  }, [todayIso]);

  // Surface any localStorage write failures once when they appear
  const activeStorageError =
    settingsStorageError ??
    attendanceStorageError ??
    notesStorageError ??
    deadlinesStorageError;

  useEffect(() => {
    if (!activeStorageError) return;
    toast.warning(STORAGE_ERROR_MESSAGES[activeStorageError], {
      id: `storage-error-${activeStorageError}`,
    });
  }, [activeStorageError, toast]);

  const weekDates = useMemo(
    () => getWeekDates(selectedDate, settings.showWeekends),
    [selectedDate, settings.showWeekends]
  );

  const weekParity = useMemo(
    () => getWeekParity(selectedDate, settings.semesterStartDate),
    [selectedDate, settings.semesterStartDate]
  );

  // Real-time today's classes for LivePairHero & Sidebar live status regardless of selectedDate
  const todayLessons = useMemo(() => {
    const todayDayNumber = getScheduleDayNumber(todayDate);
    const todayParity = getWeekParity(todayDate, settings.semesterStartDate);
    return filterLessons(
      getDayLessons(todayDayNumber, scheduleData),
      settings,
      todayParity
    );
  }, [todayDate, settings]);

  // Slow (30s) live status for Sidebar & PairCard list; LivePairHero runs its own 1s countdown
  const currentPair = useCurrentPair(todayLessons, true, {
    liveCountdown: false,
  });

  const selectedDayLessons = useMemo(() => {
    const selectedDayNumber = getScheduleDayNumber(selectedDate);
    return filterLessons(
      getDayLessons(selectedDayNumber, scheduleData),
      settings,
      weekParity
    );
  }, [selectedDate, settings, weekParity]);

  const weekGrid = useMemo(
    () => buildWeekGrid(scheduleData, settings, weekDates, weekParity),
    [settings, weekDates, weekParity]
  );

  const { liveLessonName, liveStatusLabel } = useMemo(() => {
    if (currentPair.status === 'in_lesson' && currentPair.currentLesson) {
      return {
        liveLessonName: currentPair.currentLesson.name,
        liveStatusLabel: `Зараз · до ${currentPair.currentLesson.endTime}`,
      };
    }
    if (currentPair.status === 'break' && currentPair.nextLesson) {
      return {
        liveLessonName: currentPair.nextLesson.name,
        liveStatusLabel: `Перерва · далі о ${currentPair.nextLesson.startTime}`,
      };
    }
    if (currentPair.status === 'before_first' && currentPair.nextLesson) {
      return {
        liveLessonName: currentPair.nextLesson.name,
        liveStatusLabel: `Далі о ${currentPair.nextLesson.startTime}`,
      };
    }
    if (currentPair.status === 'after_last') {
      return {
        liveLessonName: undefined,
        liveStatusLabel: 'Пари завершено',
      };
    }
    return {
      liveLessonName: undefined,
      liveStatusLabel: 'Вільний день',
    };
  }, [currentPair]);

  const handleTabChange = useCallback(
    (nextTab: TabType) => {
      setActiveTab((prevTab) => {
        if (prevTab === nextTab) return prevTab;
        setTabDirection(TAB_ORDER[nextTab] > TAB_ORDER[prevTab] ? 1 : -1);
        return nextTab;
      });
    },
    []
  );

  const handleCycleTheme = useCallback(() => {
    updateSettings({ theme: THEME_CYCLE[settings.theme] });
  }, [settings.theme, updateSettings]);

  const handlePrevDay = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, -1));
  }, []);

  const handleNextDay = useCallback(() => {
    setSelectedDate((prev) => addDays(prev, 1));
  }, []);

  const handleShiftWeek = useCallback((deltaWeeks: number) => {
    setSelectedDate((prev) => addDays(prev, deltaWeeks * 7));
  }, []);

  const handleResetToToday = useCallback(() => {
    const now = new Date();
    setTodayDate(now);
    setSelectedDate(now);
  }, []);

  const handleSelectIsoDate = useCallback((dateIso: string) => {
    const parsed = parseIsoDate(dateIso);
    if (parsed) {
      setSelectedDate(parsed);
    }
  }, []);

  const hasLessonsOnDate = useCallback(
    (date: Date): boolean => {
      const dayNum = getScheduleDayNumber(date);
      const parity = getWeekParity(date, settings.semesterStartDate);
      return (
        filterLessons(getDayLessons(dayNum, scheduleData), settings, parity)
          .length > 0
      );
    },
    [settings]
  );

  const handleOpenNotes = useCallback((lesson: Lesson, dateIso: string) => {
    setHasOpenedNotesDrawer(true);
    setNotesDrawerTarget({ lesson, dateIso });
  }, []);

  const handleCloseNotes = useCallback(() => {
    setNotesDrawerTarget(null);
  }, []);

  const getNoteCountForLesson = useCallback(
    (lessonId: string, dateIso: string): number =>
      getNotesForLesson(lessonId, dateIso).length,
    [getNotesForLesson]
  );

  const handleImportReplace = useCallback(
    (data: UniScheduleBackupData, meta?: BackupImportMeta) => {
      replaceRecords(data.attendance);
      if (!meta?.isPartialAttendanceOnly) {
        updateSettings(data.settings);
        replaceNotes(data.notes);
        replaceDeadlines(data.deadlines);
      }
    },
    [replaceRecords, updateSettings, replaceNotes, replaceDeadlines]
  );

  const handleImportMerge = useCallback(
    (data: UniScheduleBackupData, meta?: BackupImportMeta) => {
      mergeRecords(data.attendance);
      if (!meta?.isPartialAttendanceOnly) {
        updateSettings(data.settings);
        mergeNotes(data.notes);
        mergeDeadlines(data.deadlines);
      }
    },
    [mergeRecords, updateSettings, mergeNotes, mergeDeadlines]
  );

  const handleClearAll = useCallback(() => {
    clearRecords();
    clearNotes();
    clearDeadlines();
  }, [clearRecords, clearNotes, clearDeadlines]);

  const deadlinesBadgeCount = overdueCount || activeCount;

  const weekStartDate = weekDates[0];
  const weekEndDate = weekDates[weekDates.length - 1];
  const weekRangeLabel =
    weekStartDate && weekEndDate
      ? `${formatShortDateUa(formatIsoDate(weekStartDate))} – ${formatShortDateUa(formatIsoDate(weekEndDate))}`
      : '';

  const renderedWeekStrip = (
    <WeekStrip
      selectedDate={selectedDate}
      onSelectDate={setSelectedDate}
      onShiftWeek={handleShiftWeek}
      onResetToday={handleResetToToday}
      weekDates={weekDates}
      weekParity={weekParity}
      hasLessonsOnDate={hasLessonsOnDate}
    />
  );

  const renderedWeekGrid = (
    <div className="space-y-3">
      <GlassCard
        variant="glass"
        padding="sm"
        className="flex flex-wrap items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleShiftWeek(-1)}
            aria-label="Попередній тиждень"
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated/70 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
          >
            <CaretLeft className="h-4 w-4" weight="bold" aria-hidden="true" />
          </button>
          <span className="font-mono text-xs font-semibold tabular-nums text-ink">
            {weekRangeLabel}
          </span>
          <button
            type="button"
            onClick={() => handleShiftWeek(1)}
            aria-label="Наступний тиждень"
            className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated/70 text-ink-secondary transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
          >
            <CaretRight className="h-4 w-4" weight="bold" aria-hidden="true" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-line bg-surface-elevated/70 px-2.5 py-1 font-mono text-[11px] font-medium text-ink-secondary">
            {weekParity === 'numerator' ? 'Чисельник ▲' : 'Знаменник ▼'}
          </span>
          {!isToday && (
            <button
              type="button"
              onClick={handleResetToToday}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber/35 bg-amber-soft px-2.5 text-xs font-semibold text-amber-fg transition-colors hover:bg-amber/20 active:scale-[0.97]"
            >
              <ArrowCounterClockwise className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
              <span>Поточний тиждень</span>
            </button>
          )}
        </div>
      </GlassCard>

      <Suspense
        fallback={
          <GlassCard
            variant="matte"
            padding="lg"
            className="space-y-3"
            aria-busy="true"
            aria-label="Завантаження тижневої сітки"
          >
            <div className="h-5 w-44 rounded-lg bg-surface-elevated/80 animate-pulse" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <div className="h-40 rounded-xl bg-surface-elevated/60 animate-pulse" />
              <div className="h-40 rounded-xl bg-surface-elevated/60 animate-pulse" />
              <div className="hidden h-40 rounded-xl bg-surface-elevated/50 animate-pulse sm:block" />
              <div className="hidden h-40 rounded-xl bg-surface-elevated/50 animate-pulse lg:block" />
              <div className="hidden h-40 rounded-xl bg-surface-elevated/50 animate-pulse lg:block" />
            </div>
          </GlassCard>
        }
      >
        <WeekGrid
          weekGrid={weekGrid}
          selectedIso={selectedIso}
          todayIso={todayIso}
          currentLessonId={
            currentPair.status === 'in_lesson'
              ? currentPair.currentLesson?.id
              : undefined
          }
          getAttendanceStatus={getStatus}
          onToggleAttendance={toggleAttendance}
          getNoteCountForLesson={getNoteCountForLesson}
          onOpenNotes={handleOpenNotes}
          onSelectDate={handleSelectIsoDate}
        />
      </Suspense>
    </div>
  );

  return (
    <>
      <AppShell
        currentTab={activeTab}
        onTabChange={handleTabChange}
        settings={settings}
        onCycleTheme={handleCycleTheme}
        deadlinesBadgeCount={deadlinesBadgeCount}
        liveLessonName={liveLessonName}
        liveStatusLabel={liveStatusLabel}
        banner={
          <div
            className={
              !isOnline || updateAvailable
                ? 'w-full max-w-7xl mx-auto px-3 xs:px-4 lg:px-8 pt-3'
                : undefined
            }
          >
            <OfflineBanner
              isOnline={isOnline}
              updateAvailable={updateAvailable}
              onApplyUpdate={applyUpdate}
              onDismissUpdate={dismissUpdate}
            />
          </div>
        }
        bottomNav={
          <BottomNav
            currentTab={activeTab}
            onTabChange={handleTabChange}
            deadlinesBadgeCount={deadlinesBadgeCount}
          />
        }
      >
        <PageTransition pageKey={activeTab} direction={tabDirection}>
          {activeTab === 'schedule' && (
            <ScheduleView
              selectedDate={selectedDate}
              selectedIso={selectedIso}
              todayIso={todayIso}
              isToday={isToday}
              onPrevDay={handlePrevDay}
              onNextDay={handleNextDay}
              onResetToToday={handleResetToToday}
              lessons={selectedDayLessons}
              todayLessons={todayLessons}
              currentPair={currentPair}
              settings={settings}
              onUpdateSettings={updateSettings}
              teachersMap={teachersMap}
              classroomsMap={classroomsMap}
              getAttendanceStatus={getStatus}
              onToggleAttendance={toggleAttendance}
              notes={notes}
              deadlines={deadlines}
              onOpenNotes={handleOpenNotes}
              onNavigateToDeadlines={() => handleTabChange('deadlines')}
              onNavigateToSettings={() => handleTabChange('settings')}
              isDrawerOpen={notesDrawerTarget !== null}
              renderWeekStrip={renderedWeekStrip}
              renderWeekGrid={renderedWeekGrid}
            />
          )}

          {activeTab === 'deadlines' && (
            <Suspense fallback={<ViewSkeleton />}>
              <DeadlinesView
                deadlines={deadlines}
                onAddDeadline={addDeadline}
                onToggleDeadline={toggleDeadline}
                onUpdateDeadline={updateDeadline}
                onDeleteDeadline={deleteDeadline}
                settings={settings}
                todayIso={todayIso}
              />
            </Suspense>
          )}

          {activeTab === 'stats' && (
            <Suspense fallback={<ViewSkeleton />}>
              <StatsView
                records={records}
                settings={settings}
                onUpdateSettings={updateSettings}
              />
            </Suspense>
          )}

          {activeTab === 'directory' && (
            <Suspense fallback={<ViewSkeleton />}>
              <DirectoryView
                teachers={teachersData}
                classrooms={classroomsData}
                schedule={scheduleData}
                teachersMap={teachersMap}
                classroomsMap={classroomsMap}
              />
            </Suspense>
          )}

          {activeTab === 'settings' && (
            <Suspense fallback={<ViewSkeleton />}>
              <SettingsView
                settings={settings}
                onUpdate={updateSettings}
                onResetSettings={resetSettings}
                attendanceRecords={records}
                notes={notes}
                deadlines={deadlines}
                onImportReplace={handleImportReplace}
                onImportMerge={handleImportMerge}
                onClearAll={handleClearAll}
              />
            </Suspense>
          )}
        </PageTransition>
      </AppShell>

      {hasOpenedNotesDrawer && (
        <Suspense fallback={null}>
          <LessonNotesDrawer
            open={notesDrawerTarget !== null}
            onClose={handleCloseNotes}
            lesson={notesDrawerTarget?.lesson ?? null}
            dateIso={notesDrawerTarget?.dateIso ?? selectedIso}
            notes={notes}
            onSaveNote={saveNote}
            onDeleteNote={deleteNote}
            onCreateDeadline={addDeadline}
            teacher={
              notesDrawerTarget
                ? getTeacherById(notesDrawerTarget.lesson.teacherId)
                : undefined
            }
            classroom={
              notesDrawerTarget
                ? getClassroomById(notesDrawerTarget.lesson.classroomId)
                : undefined
            }
          />
        </Suspense>
      )}
    </>
  );
};

export const App: React.FC = () => {
  return (
    <RootErrorBoundary>
      <AppMotionProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AppMotionProvider>
    </RootErrorBoundary>
  );
};

export default App;
