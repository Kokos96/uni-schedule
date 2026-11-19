import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppShell } from './components/layout/AppShell';
import { BottomNav, type TabType } from './components/layout/BottomNav';
import { OfflineBanner } from './components/layout/OfflineBanner';
import { RootErrorBoundary } from './components/layout/RootErrorBoundary';
import { ViewSkeleton } from './components/layout/ViewSkeleton';
import {
  AppMotionProvider,
  PageTransition,
} from './components/motion/MotionPrimitives';
import { ScheduleView } from './components/schedule/ScheduleView';
import { WeekGridSection } from './components/schedule/WeekGridSection';
import { WeekStrip } from './components/schedule/WeekStrip';
import type { BackupImportMeta } from './components/settings/BackupSection';
import { ToastProvider, useToast } from './components/ui/Toast';
import { useAttendance } from './hooks/useAttendance';
import { useCurrentPair } from './hooks/useCurrentPair';
import { useDeadlines } from './hooks/useDeadlines';
import { useNotes } from './hooks/useNotes';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useScheduleSource } from './hooks/useScheduleSource';
import { useSettings } from './hooks/useSettings';
import { useTheme } from './hooks/useTheme';
import { useTodayDate } from './hooks/useTodayDate';
import type { Lesson, ThemeMode } from './types';
import type { UniScheduleBackupData } from './types/backup';
import {
  addDays,
  formatIsoDate,
  getWeekDates,
  getWeekParity,
  parseIsoDate,
} from './utils/date';
import { buildWeekGrid } from './utils/schedule';
import type { StorageErrorCode } from './utils/storage';

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
  quota_exceeded:
    'Перевищено ліміт локального сховища браузера. Зробіть резервну копію.',
  unavailable:
    'Локальне сховище недоступне — зміни можуть не зберегтися після закриття.',
  unknown: 'Не вдалося зберегти дані у локальне сховище браузера.',
};

const AppContent: React.FC = () => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [tabDirection, setTabDirection] = useState<number>(0);

  const { todayDate, todayIso, refreshToday } = useTodayDate();
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());

  const {
    settings,
    updateSettings,
    resetSettings,
    storageError: settingsStorageError,
  } = useSettings();
  useTheme(settings.theme);

  const scheduleSource = useScheduleSource(settings);

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

  const selectedIso = useMemo(() => formatIsoDate(selectedDate), [selectedDate]);
  const isToday = selectedIso === todayIso;

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
    const todayParity = getWeekParity(todayDate, settings.semesterStartDate);
    return scheduleSource.getLessonsForDate(todayDate, todayParity);
  }, [todayDate, settings.semesterStartDate, scheduleSource]);

  // Slow (30s) live status for Sidebar & PairCard list; LivePairHero runs its own 1s countdown
  const currentPair = useCurrentPair(todayLessons, true, {
    liveCountdown: false,
  });

  const selectedDayLessons = useMemo(
    () => scheduleSource.getLessonsForDate(selectedDate, weekParity),
    [selectedDate, weekParity, scheduleSource]
  );

  const weekGrid = useMemo(
    () =>
      buildWeekGrid(
        scheduleSource.schedule,
        settings,
        weekDates,
        weekParity,
        scheduleSource.datedLessonsByIso ?? undefined
      ),
    [
      scheduleSource.schedule,
      scheduleSource.datedLessonsByIso,
      settings,
      weekDates,
      weekParity,
    ]
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

  const handleTabChange = useCallback((nextTab: TabType) => {
    setActiveTab((prevTab) => {
      if (prevTab === nextTab) return prevTab;
      setTabDirection(TAB_ORDER[nextTab] > TAB_ORDER[prevTab] ? 1 : -1);
      return nextTab;
    });
  }, []);

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
    const now = refreshToday();
    setSelectedDate(now);
  }, [refreshToday]);

  const handleSelectIsoDate = useCallback((dateIso: string) => {
    const parsed = parseIsoDate(dateIso);
    if (parsed) {
      setSelectedDate(parsed);
    }
  }, []);

  const hasLessonsOnDate = useCallback(
    (date: Date): boolean => {
      const parity = getWeekParity(date, settings.semesterStartDate);
      return scheduleSource.getLessonsForDate(date, parity).length > 0;
    },
    [settings.semesterStartDate, scheduleSource]
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
    <WeekGridSection
      weekDates={weekDates}
      weekGrid={weekGrid}
      weekParity={weekParity}
      selectedIso={selectedIso}
      todayIso={todayIso}
      isToday={isToday}
      currentLessonId={
        currentPair.status === 'in_lesson'
          ? currentPair.currentLesson?.id
          : undefined
      }
      onShiftWeek={handleShiftWeek}
      onResetToToday={handleResetToToday}
      onSelectDate={handleSelectIsoDate}
      getAttendanceStatus={getStatus}
      onToggleAttendance={toggleAttendance}
      getNoteCountForLesson={getNoteCountForLesson}
      onOpenNotes={handleOpenNotes}
    />
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
              teachersMap={scheduleSource.teachersMap}
              classroomsMap={scheduleSource.classroomsMap}
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
                scheduleMap={scheduleSource.scheduleMap}
                onUpdateSettings={updateSettings}
              />
            </Suspense>
          )}

          {activeTab === 'directory' && (
            <Suspense fallback={<ViewSkeleton />}>
              <DirectoryView
                teachers={scheduleSource.teachers}
                classrooms={scheduleSource.classrooms}
                schedule={scheduleSource.schedule}
                teachersMap={scheduleSource.teachersMap}
                classroomsMap={scheduleSource.classroomsMap}
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
                syncStatus={scheduleSource.syncStatus}
                lastSyncedAt={scheduleSource.lastSyncedAt}
                syncError={scheduleSource.syncError}
                onSyncGroupSchedule={scheduleSource.syncGroupSchedule}
                onResetBuiltinSchedule={scheduleSource.clearCachedSchedule}
                isUsingCustomGroup={scheduleSource.isUsingCustomGroup}
                availableElectives={scheduleSource.availableElectives}
                availableTracks={scheduleSource.availableTracks}
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
                ? scheduleSource.teachersMap.get(notesDrawerTarget.lesson.teacherId)
                : undefined
            }
            classroom={
              notesDrawerTarget
                ? scheduleSource.classroomsMap.get(notesDrawerTarget.lesson.classroomId)
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
