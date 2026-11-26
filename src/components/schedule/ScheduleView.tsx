import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowCounterClockwise,
  ArrowRight,
  Calendar,
  CalendarDots,
  CaretLeft,
  CaretRight,
  Columns,
  SlidersHorizontal,
} from '@phosphor-icons/react';
import type { CurrentPairState } from '../../hooks/useCurrentPair';
import type { ScheduleDateAvailability } from '../../hooks/useScheduleSource';
import type { ParallelGroupDimension } from '../../utils/parallelGroups';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import {
  REDUCED_MOTION_TRANSITION,
  daySwitchVariants,
  useAppReducedMotion,
} from '../../lib/motion';
import type {
  AttendanceStatus,
  Classroom,
  DesktopScheduleMode,
  Lesson,
  ResolvedUserSettings,
  Teacher,
  UserSettings,
} from '../../types';
import type { DeadlineItem, LessonNote } from '../../types/notes';
import {
  DAY_NAMES_UA_FULL,
  MONTH_NAMES_UA_GENITIVE,
  formatShortDateUa,
  getScheduleDayNumber,
  getWeekParity,
} from '../../utils/date';
import {
  StaggerCard,
  StaggerList,
  SwipeableDayContainer,
} from '../motion/MotionPrimitives';
import { MetaChip, StatusDot } from '../ui/Badge';
import {
  EditorialUnderline,
  FreeDayIllustration,
  WeekendIllustration,
} from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';
import { SegmentedControl } from '../ui/SegmentedControl';
import { LivePairHero } from './LivePairHero';
import { PairCard } from './PairCard';
import { ScheduleSidebarWidgets } from './ScheduleSidebarWidgets';

export interface ScheduleViewProps {
  selectedDate: Date;
  selectedIso: string;
  todayIso: string;
  isToday: boolean;
  onPrevDay: () => void;
  onNextDay: () => void;
  onResetToToday: () => void;
  lessons: Lesson[];
  unfilteredParallelLessons?: Lesson[];
  dateAvailability?: ScheduleDateAvailability;
  todayAvailability?: ScheduleDateAvailability;
  needsElectiveSelection?: boolean;
  unconfiguredParallelGroups?: ParallelGroupDimension[];
  staleParallelGroups?: ParallelGroupDimension[];
  partialParallelGroups?: ParallelGroupDimension[];
  todayLessons?: Lesson[];
  currentPair: CurrentPairState;
  settings: ResolvedUserSettings;
  onUpdateSettings: (patch: Partial<UserSettings>) => void;
  teachersMap: Map<string, Teacher>;
  classroomsMap: Map<string, Classroom>;
  getAttendanceStatus: (lessonId: string, date: string) => AttendanceStatus | null;
  onToggleAttendance: (
    lessonId: string,
    date: string,
    status: AttendanceStatus
  ) => void;
  notes: LessonNote[];
  deadlines: DeadlineItem[];
  onOpenNotes: (lesson: Lesson, dateIso: string) => void;
  onNavigateToDeadlines?: () => void;
  onNavigateToSettings?: () => void;
  isDrawerOpen?: boolean;
  renderWeekStrip: React.ReactNode;
  renderWeekGrid: React.ReactNode;
}

function buildNoteCountMapForDate(
  notes: readonly LessonNote[],
  dateIso: string
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) {
    if (note.date === undefined || note.date === dateIso) {
      counts.set(note.lessonId, (counts.get(note.lessonId) ?? 0) + 1);
    }
  }
  return counts;
}

export const ScheduleView: React.FC<ScheduleViewProps> = ({
  selectedDate,
  selectedIso,
  todayIso,
  isToday,
  onPrevDay,
  onNextDay,
  onResetToToday,
  lessons,
  unfilteredParallelLessons,
  dateAvailability = 'loaded',
  todayAvailability = 'loaded',
  needsElectiveSelection = false,
  unconfiguredParallelGroups = [],
  staleParallelGroups = [],
  partialParallelGroups = [],
  todayLessons,
  currentPair,
  settings,
  onUpdateSettings,
  teachersMap,
  classroomsMap,
  getAttendanceStatus,
  onToggleAttendance,
  notes,
  deadlines,
  onOpenNotes,
  onNavigateToDeadlines,
  onNavigateToSettings,
  isDrawerOpen = false,
  renderWeekStrip,
  renderWeekGrid,
}) => {
  const isDesktop = useIsDesktop();
  const reducedMotion = useAppReducedMotion();
  const [mobileMode, setMobileMode] = useState<DesktopScheduleMode>('day');
  const [showAllParallelForDateIso, setShowAllParallelForDateIso] = useState<string | null>(null);

  const isShowingAllParallelToday = showAllParallelForDateIso === selectedIso;
  const hiddenParallelCount =
    unfilteredParallelLessons && unfilteredParallelLessons.length > lessons.length
      ? unfilteredParallelLessons.length - lessons.length
      : 0;
  const visibleDayLessons =
    isShowingAllParallelToday && unfilteredParallelLessons
      ? unfilteredParallelLessons
      : lessons;

  const activeMode: DesktopScheduleMode = isDesktop
    ? settings.desktopScheduleMode
    : mobileMode;

  const handleModeChange = (mode: DesktopScheduleMode) => {
    if (isDesktop) {
      onUpdateSettings({ desktopScheduleMode: mode });
    } else {
      setMobileMode(mode);
    }
  };

  // Track horizontal day switch direction
  const prevIsoRef = useRef<string>(selectedIso);
  const directionRef = useRef<number>(1);
  if (prevIsoRef.current !== selectedIso) {
    directionRef.current = selectedIso > prevIsoRef.current ? 1 : -1;
    prevIsoRef.current = selectedIso;
  }

  // Desktop ArrowLeft / ArrowRight keyboard navigation
  useEffect(() => {
    if (!isDesktop || activeMode !== 'day' || isDrawerOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          target.isContentEditable
        ) {
          return;
        }
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onPrevDay();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onNextDay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, activeMode, isDrawerOpen, onPrevDay, onNextDay]);

  const dayNumber = getScheduleDayNumber(selectedDate);
  const dayName = DAY_NAMES_UA_FULL[dayNumber] ?? '';
  const isWeekend = dayNumber === 6 || dayNumber === 7;
  const parity = getWeekParity(selectedDate, settings.semesterStartDate);
  const parityLabel = parity === 'numerator' ? 'Чисельник' : 'Знаменник';
  const formattedDate = `${selectedDate.getDate()} ${MONTH_NAMES_UA_GENITIVE[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`;

  const selectedNoteCountMap = useMemo(
    () => buildNoteCountMapForDate(notes, selectedIso),
    [notes, selectedIso]
  );

  const todayNoteCountMap = useMemo(
    () =>
      selectedIso === todayIso
        ? selectedNoteCountMap
        : buildNoteCountMapForDate(notes, todayIso),
    [notes, selectedIso, todayIso, selectedNoteCountMap]
  );

  // Earliest uncompleted deadline per lesson/subject for PairCard pills
  const deadlineLabelByLessonId = useMemo(() => {
    const map = new Map<string, string>();
    const active = deadlines
      .filter((item) => !item.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    for (const lesson of lessons) {
      const match = active.find(
        (d) =>
          d.lessonId === lesson.id ||
          (d.subjectName && d.subjectName === lesson.name)
      );
      if (match) {
        const shortDate = formatShortDateUa(match.dueDate);
        map.set(
          lesson.id,
          match.dueDate < todayIso ? `Прострочено (${shortDate})` : shortDate
        );
      }
    }
    return map;
  }, [deadlines, lessons, todayIso]);

  // Top upcoming deadlines for desktop inspector
  const upcomingDeadlines = useMemo(() => {
    return deadlines
      .filter((d) => !d.completed)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 3);
  }, [deadlines]);

  const activeLessonId =
    isToday && currentPair.status === 'in_lesson'
      ? currentPair.currentLesson?.id
      : undefined;

  const renderDayLessons = () => {
    if (visibleDayLessons.length === 0) {
      const unavailable = dateAvailability === 'outside_coverage' || dateAvailability === 'not_loaded';
      const hasHiddenParallel = !unavailable && hiddenParallelCount > 0;
      return (
        <GlassCard variant="matte" padding="none">
          <EmptyState
            illustration={
              !unavailable && isWeekend ? (
                <WeekendIllustration size={80} />
              ) : (
                <FreeDayIllustration size={80} />
              )
            }
            showUnderline
            title={
              unavailable
                ? settings.scheduleSourceMode === 'unconfigured' ? 'Оберіть розклад' : 'Розклад недоступний'
                : hasHiddenParallel
                  ? 'Пар обраної підгрупи немає'
                  : needsElectiveSelection && !isWeekend
                    ? 'Потрібно обрати ДВВС'
                    : isWeekend
                      ? 'Вихідний день'
                      : 'Пар немає'
            }
            description={
              settings.scheduleSourceMode === 'unconfigured'
                ? 'Оберіть університет, факультет і групу в налаштуваннях, щоб завантажити розклад.'
                : dateAvailability === 'outside_coverage'
                ? 'Ця дата поза завантаженим періодом. Оновіть розклад групи в налаштуваннях.'
                : dateAvailability === 'not_loaded'
                  ? 'Розклад обраної групи ще не завантажено. Відкрийте налаштування та синхронізуйте його.'
                  : hasHiddenParallel
                    ? `У цей день є ${hiddenParallelCount} паралельних занять інших викладачів (можлива точкова заміна викладача).`
                    : needsElectiveSelection && !isWeekend
                      ? 'У завантаженому розкладі знайдено вибіркові дисципліни (ДВВС), але жодна ще не обрана.'
                      : isWeekend
                        ? 'Час перепочити або спокійно підготуватися до наступного тижня.'
                        : 'У цей день за вашим профілем занять немає. Можна переглянути дедлайни або сусідній день.'
            }
            action={
              unavailable && onNavigateToSettings
                ? {
                    label: 'Відкрити налаштування розкладу',
                    onClick: onNavigateToSettings,
                  }
                : hasHiddenParallel
                  ? {
                      label: `Показати всі підгрупи (${hiddenParallelCount})`,
                      onClick: () => setShowAllParallelForDateIso(selectedIso),
                    }
                  : needsElectiveSelection && onNavigateToSettings
                  ? {
                      label: 'Обрати ДВВС в Опціях',
                      onClick: onNavigateToSettings,
                    }
                  : !isToday
                    ? {
                        label: 'Повернутися на сьогодні',
                        onClick: onResetToToday,
                        icon: <ArrowCounterClockwise className="h-3.5 w-3.5" weight="regular" />,
                      }
                    : onNavigateToDeadlines
                      ? {
                          label: 'Переглянути дедлайни',
                          onClick: onNavigateToDeadlines,
                          icon: <ArrowRight className="h-3.5 w-3.5" weight="regular" />,
                        }
                      : undefined
            }
          />
        </GlassCard>
      );
    }

    return (
      <div className="space-y-3">
        {isShowingAllParallelToday && hiddenParallelCount > 0 && (
          <div
            data-testid="showing-all-parallel-banner"
            className="flex items-center justify-between gap-2 rounded-xl border border-amber/35 bg-amber-soft/65 px-3.5 py-2 text-xs"
          >
            <span className="text-ink-secondary">
              Показано всі паралельні підгрупи за цей день (для перевірки можливих замін)
            </span>
            <button
              type="button"
              onClick={() => setShowAllParallelForDateIso(null)}
              className="shrink-0 font-semibold text-amber-fg hover:underline"
            >
              Моя підгрупа
            </button>
          </div>
        )}
        <StaggerList itemCount={visibleDayLessons.length} className="space-y-3">
          {visibleDayLessons.map((lesson) => (
            <StaggerCard key={lesson.id} interactive={false}>
              <PairCard
                lesson={lesson}
                teacher={teachersMap.get(lesson.teacherId)}
                classroom={classroomsMap.get(lesson.classroomId)}
                isCurrent={activeLessonId === lesson.id}
                attendanceStatus={getAttendanceStatus(lesson.id, selectedIso)}
                onToggleAttendance={(status) =>
                  onToggleAttendance(lesson.id, selectedIso, status)
                }
                noteCount={selectedNoteCountMap.get(lesson.id) ?? 0}
                activeDeadlineLabel={deadlineLabelByLessonId.get(lesson.id) ?? null}
                onOpenNotes={() => onOpenNotes(lesson, selectedIso)}
              />
            </StaggerCard>
          ))}
        </StaggerList>
        {!isShowingAllParallelToday && hiddenParallelCount > 0 && (
          <div className="flex justify-center pt-1">
            <button
              type="button"
              data-testid="toggle-hidden-parallel-btn"
              onClick={() => setShowAllParallelForDateIso(selectedIso)}
              className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-line bg-surface-elevated/60 px-3.5 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:border-amber/40 hover:text-amber-fg"
            >
              <span>Приховано паралельних підгруп: {hiddenParallelCount} · Перевірити заміни</span>
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MetaChip variant="amber">{parityLabel}</MetaChip>
            <span className="font-mono text-xs tabular-nums text-ink-secondary">
              {formattedDate}
            </span>
            {isToday && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-sage/35 bg-sage-soft px-2 py-0.5 text-[11px] font-medium text-sage-fg">
                <StatusDot tone="sage" size="sm" />
                <span>Сьогодні</span>
              </span>
            )}
          </div>

          <div className="mt-1.5 flex items-center gap-3">
            <h2 className="font-serif text-2xl font-medium tracking-[-0.015em] text-ink sm:text-[26px]">
              {activeMode === 'week' ? 'Розклад на тиждень' : dayName}
            </h2>
            {!isToday && (
              <button
                type="button"
                onClick={onResetToToday}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-xl border border-amber/35 bg-amber-soft px-2.5 text-xs font-medium text-amber-fg transition-colors hover:border-amber/60 active:scale-[0.97]"
              >
                <ArrowCounterClockwise className="h-3 w-3" weight="regular" aria-hidden="true" />
                <span>Сьогодні</span>
              </button>
            )}
          </div>
          <EditorialUnderline width={88} className="mt-1.5" />
        </div>

        {/* Controls: Day/Week Switcher + Desktop prev/next day arrows */}
        <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
          {activeMode === 'day' && (
            <div className="hidden items-center gap-1 lg:flex">
              <button
                type="button"
                onClick={onPrevDay}
                aria-label="Попередній день"
                title="Попередній день (←)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-secondary transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
              >
                <CaretLeft className="h-4 w-4" weight="bold" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onNextDay}
                aria-label="Наступний день"
                title="Наступний день (→)"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-surface text-ink-secondary transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
              >
                <CaretRight className="h-4 w-4" weight="bold" aria-hidden="true" />
              </button>
            </div>
          )}

          <SegmentedControl<DesktopScheduleMode>
            layoutId={`schedule-mode-${isDesktop ? 'desktop' : 'mobile'}`}
            ariaLabel="Режим перегляду розкладу"
            size="sm"
            value={activeMode}
            onChange={handleModeChange}
            options={[
              {
                value: 'day',
                label: 'День',
                icon: <Calendar className="h-3.5 w-3.5" weight="regular" />,
              },
              {
                value: 'week',
                label: 'Тиждень',
                icon: isDesktop ? (
                  <Columns className="h-3.5 w-3.5" weight="regular" />
                ) : (
                  <CalendarDots className="h-3.5 w-3.5" weight="regular" />
                ),
              },
            ]}
          />
        </div>
      </div>

      {(unconfiguredParallelGroups.length > 0 || staleParallelGroups.length > 0 || partialParallelGroups.length > 0) && (
        <div
          role="region"
          aria-label="Налаштування паралельних підгруп"
          data-testid="parallel-groups-banner"
          className="flex flex-col gap-2.5 rounded-2xl border border-amber/35 bg-amber-soft/75 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <SlidersHorizontal
              weight="duotone"
              className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg"
              aria-hidden="true"
            />
            <div className="min-w-0">
              {staleParallelGroups.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-ink">
                    Обрана підгрупа відсутня в актуальному розкладі ({staleParallelGroups.map((d) => d.label).join(', ')})
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">
                    Можлива заміна викладача — тимчасово показано всі варіанти, щоб не приховати ваші пари. Оновіть вибір.
                  </p>
                </>
              ) : unconfiguredParallelGroups.length > 0 ? (
                <>
                  <p className="text-xs font-semibold text-ink">
                    Показано всі паралельні підгрупи ({unconfiguredParallelGroups.map((d) => d.label).join(', ')})
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">
                    Оберіть свою мову та викладача у налаштуваннях профілю, щоб приховати чужі підгрупи.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold text-ink">
                    Часткова фільтрація за мовою ({partialParallelGroups.map((d) => d.label).join(', ')})
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-ink-secondary">
                    Показано кількох викладачів обраної мови. Для повної персоналізації оберіть свого викладача.
                  </p>
                </>
              )}
            </div>
          </div>
          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="inline-flex min-h-[34px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber/45 bg-surface px-3 py-1.5 text-xs font-semibold text-amber-fg transition-colors hover:border-amber/70 active:scale-[0.98]"
            >
              <span>Обрати підгрупи</span>
              <ArrowRight className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Week Mode */}
      {activeMode === 'week' ? (
        <div className="space-y-4">
          {renderWeekGrid ?? (
            <GlassCard variant="matte" padding="lg">
              <p className="text-sm text-ink-secondary">
                Тижнева сітка готується до відображення.
              </p>
            </GlassCard>
          )}
        </div>
      ) : isDesktop ? (
        /* Desktop Day Mode: 12-column Dashboard */
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left column: WeekStrip + Day Lessons */}
          <div className="space-y-4 lg:col-span-7">
            {renderWeekStrip}

            <AnimatePresence
              mode="wait"
              initial={false}
              custom={directionRef.current}
            >
              <motion.div
                key={selectedIso}
                custom={directionRef.current}
                variants={
                  reducedMotion
                    ? {
                        initial: { opacity: 0 },
                        animate: {
                          opacity: 1,
                          transition: REDUCED_MOTION_TRANSITION,
                        },
                        exit: {
                          opacity: 0,
                          transition: REDUCED_MOTION_TRANSITION,
                        },
                      }
                    : daySwitchVariants
                }
                initial="initial"
                animate="animate"
                exit="exit"
              >
                {renderDayLessons()}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right column: Sticky Inspector */}
          <aside className="space-y-4 lg:sticky lg:top-6 lg:col-span-5">
            <LivePairHero
              currentPair={currentPair}
              todayLessons={todayLessons}
              teachersMap={teachersMap}
              classroomsMap={classroomsMap}
              todayIso={todayIso}
              todayAvailability={todayAvailability}
              sourceMode={settings.scheduleSourceMode}
              onNavigateToSettings={onNavigateToSettings}
              getStatus={getAttendanceStatus}
              onToggleAttendance={onToggleAttendance}
              onOpenNotes={onOpenNotes}
              noteCountMap={todayNoteCountMap}
            />

            <ScheduleSidebarWidgets
              upcomingDeadlines={upcomingDeadlines}
              todayIso={todayIso}
              settings={settings}
              onNavigateToDeadlines={onNavigateToDeadlines}
              onNavigateToSettings={onNavigateToSettings}
            />
          </aside>
        </div>
      ) : (
        /* Mobile Day Mode */
        <div className="space-y-4">
          {renderWeekStrip}

          <SwipeableDayContainer onPrevDay={onPrevDay} onNextDay={onNextDay}>
            <AnimatePresence
              mode="wait"
              initial={false}
              custom={directionRef.current}
            >
              <motion.div
                key={selectedIso}
                custom={directionRef.current}
                variants={
                  reducedMotion
                    ? {
                        initial: { opacity: 0 },
                        animate: {
                          opacity: 1,
                          transition: REDUCED_MOTION_TRANSITION,
                        },
                        exit: {
                          opacity: 0,
                          transition: REDUCED_MOTION_TRANSITION,
                        },
                      }
                    : daySwitchVariants
                }
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-4"
              >
                {isToday && (
                  <LivePairHero
                    currentPair={currentPair}
                    todayLessons={todayLessons}
                    teachersMap={teachersMap}
                    classroomsMap={classroomsMap}
                    todayIso={todayIso}
                    todayAvailability={todayAvailability}
                    sourceMode={settings.scheduleSourceMode}
                    onNavigateToSettings={onNavigateToSettings}
                    getStatus={getAttendanceStatus}
                    onToggleAttendance={onToggleAttendance}
                    onOpenNotes={onOpenNotes}
                    noteCountMap={todayNoteCountMap}
                  />
                )}

                {renderDayLessons()}
              </motion.div>
            </AnimatePresence>
          </SwipeableDayContainer>
        </div>
      )}
    </div>
  );
};
