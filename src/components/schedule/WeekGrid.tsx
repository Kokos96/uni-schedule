import React, { useState } from 'react';
import {
  Check,
  Clock,
  MapPin,
  Note,
  Sparkle,
  User,
  X,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import type {
  AttendanceStatus,
  Classroom,
  Lesson,
  LessonType,
  ScheduleSourceMode,
  Teacher,
} from '../../types';
import {
  DAY_NAMES_UA_FULL,
  DAY_NAMES_UA_SHORT,
  MONTH_NAMES_UA_GENITIVE,
  formatShortDateUa,
  parseIsoDate,
} from '../../utils/date';
import type { WeekGridData } from '../../utils/schedule';
import type { ScheduleDateAvailability } from '../../hooks/useScheduleSource';
import { cn } from '../../utils/cn';
import { LessonTypeBadge, MetaChip, StatusDot, type StatusDotTone } from '../ui/Badge';
import { FreeDayIllustration } from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';
import { ModalDrawer } from '../ui/ModalDrawer';

export interface WeekGridProps {
  weekGrid: WeekGridData;
  weekAvailability?: ScheduleDateAvailability;
  sourceMode?: ScheduleSourceMode;
  teachersMap: Map<string, Teacher>;
  classroomsMap: Map<string, Classroom>;
  selectedIso: string;
  todayIso: string;
  currentLessonId?: string;
  getAttendanceStatus: (lessonId: string, dateIso: string) => AttendanceStatus | null;
  onToggleAttendance: (lessonId: string, dateIso: string, status: AttendanceStatus) => void;
  getNoteCountForLesson: (lessonId: string, dateIso: string) => number;
  onOpenNotes: (lesson: Lesson, dateIso: string) => void;
  onSelectDate: (dateIso: string) => void;
  needsElectiveSelection?: boolean;
  onNavigateToSettings?: () => void;
}

const STRIPE_CLASS_BY_TYPE: Record<LessonType, string> = {
  'Лекція': 'bg-beige',
  'Практична': 'bg-terracotta',
  'Лабораторна': 'bg-sage',
};

const ATTENDANCE_DOT_META: Record<
  AttendanceStatus,
  { tone: StatusDotTone; label: string }
> = {
  present: { tone: 'sage', label: 'Був' },
  absent: { tone: 'terracotta', label: 'Н-ка' },
  excused: { tone: 'amber', label: 'Поважна' },
};

const ATTENDANCE_BUTTONS: ReadonlyArray<{
  status: AttendanceStatus;
  label: string;
  Icon: PhosphorIcon;
  activeStyle: React.CSSProperties;
}> = [
  {
    status: 'present',
    label: 'Був',
    Icon: Check,
    activeStyle: {
      backgroundColor: 'var(--status-present-bg)',
      color: 'var(--status-present-fg)',
      borderColor: 'transparent',
    },
  },
  {
    status: 'absent',
    label: 'Н-ка',
    Icon: X,
    activeStyle: {
      backgroundColor: 'var(--status-absent-bg)',
      color: 'var(--status-absent-fg)',
      borderColor: 'transparent',
    },
  },
  {
    status: 'excused',
    label: 'Поважна',
    Icon: Clock,
    activeStyle: {
      backgroundColor: 'var(--status-excused-bg)',
      color: 'var(--status-excused-fg)',
      borderColor: 'transparent',
    },
  },
];

function getTeacherSurname(teacher: Teacher | undefined): string {
  if (!teacher) return 'Викладача не вказано';
  const trimmed = teacher.fullName.trim();
  if (!trimmed || trimmed === 'Викладача не вказано' || /^t_/.test(trimmed)) {
    return 'Викладача не вказано';
  }
  const firstToken = trimmed.split(/\s+/)[0];
  return firstToken || 'Викладача не вказано';
}

function getClassroomCodeLabel(classroom: Classroom | undefined): string {
  const code = classroom?.code?.trim();
  if (!code || code === '—' || /^c_/.test(code)) {
    return 'Аудиторію не вказано';
  }
  return code;
}

function formatFullDateUa(isoDate: string, fallbackDayNumber?: number): string {
  const parsed = parseIsoDate(isoDate);
  if (!parsed) return isoDate;
  const dayNum = parsed.getDay() === 0 ? 7 : parsed.getDay();
  const dayName = DAY_NAMES_UA_FULL[fallbackDayNumber ?? dayNum] ?? '';
  const monthGen = MONTH_NAMES_UA_GENITIVE[parsed.getMonth()] ?? '';
  return `${dayName}, ${parsed.getDate()} ${monthGen}`;
}

export const WeekGrid: React.FC<WeekGridProps> = ({
  weekGrid,
  weekAvailability = 'loaded',
  sourceMode,
  teachersMap,
  classroomsMap,
  selectedIso,
  todayIso,
  currentLessonId,
  getAttendanceStatus,
  onToggleAttendance,
  getNoteCountForLesson,
  onOpenNotes,
  onSelectDate,
  needsElectiveSelection = false,
  onNavigateToSettings,
}) => {
  const [activeCell, setActiveCell] = useState<{
    lesson: Lesson;
    dateIso: string;
    dayNumber: number;
  } | null>(null);

  const { days, slots, activeSlotOrders } = weekGrid;

  if (days.length === 0 || activeSlotOrders.length === 0) {
    return (
      <GlassCard variant="matte" padding="lg">
        <EmptyState
          title={weekAvailability === 'outside_coverage' || weekAvailability === 'not_loaded'
            ? sourceMode === 'unconfigured' ? 'Оберіть розклад' : 'Розклад недоступний'
            : needsElectiveSelection ? 'Потрібно обрати ДВВС' : 'На цей тиждень пар немає'}
          description={
            sourceMode === 'unconfigured'
              ? 'Оберіть університет і групу в налаштуваннях.'
              : weekAvailability === 'outside_coverage'
              ? 'Цей тиждень поза завантаженим періодом. Оновіть розклад групи в налаштуваннях.'
              : weekAvailability === 'not_loaded'
                ? 'Розклад обраної групи ще не завантажено.'
            : needsElectiveSelection
              ? 'У завантаженому розкладі знайдено вибіркові дисципліни (ДВВС), але жодна ще не обрана.'
              : 'Оберіть інший тиждень або перевірте налаштування підгрупи та кафедри.'
          }
          illustration={<FreeDayIllustration size={72} />}
          showUnderline
          action={
            (weekAvailability === 'outside_coverage' || weekAvailability === 'not_loaded') && onNavigateToSettings
              ? { label: 'Відкрити налаштування розкладу', onClick: onNavigateToSettings }
              : needsElectiveSelection && onNavigateToSettings
              ? {
                  label: 'Обрати ДВВС в Опціях',
                  onClick: onNavigateToSettings,
                }
              : undefined
          }
        />
      </GlassCard>
    );
  }

  const minOrder = activeSlotOrders[0];
  const maxOrder = activeSlotOrders[activeSlotOrders.length - 1];
  const visibleSlots = slots.filter(
    (slot) => slot.order >= minOrder && slot.order <= maxOrder
  );

  const gridTemplateStyle: React.CSSProperties = {
    gridTemplateColumns: `var(--grid-gutter) repeat(${days.length}, minmax(var(--grid-col-min), 1fr))`,
  };

  const activeLesson = activeCell?.lesson ?? null;
  const activeDateIso = activeCell?.dateIso ?? '';
  const activeTeacher = activeLesson ? teachersMap.get(activeLesson.teacherId) : undefined;
  const activeClassroom = activeLesson ? classroomsMap.get(activeLesson.classroomId) : undefined;
  const activeAttendance = activeLesson
    ? getAttendanceStatus(activeLesson.id, activeDateIso)
    : null;
  const activeNoteCount = activeLesson
    ? getNoteCountForLesson(activeLesson.id, activeDateIso)
    : 0;
  const isActiveCellLive = Boolean(
    activeLesson &&
      currentLessonId === activeLesson.id &&
      activeDateIso === todayIso
  );

  return (
    <>
      <div className="rounded-2xl border border-line bg-surface shadow-elevated overflow-hidden">
        <div className="overflow-x-auto">
          <div
            style={gridTemplateStyle}
            className="grid [--grid-gutter:56px] lg:[--grid-gutter:64px] [--grid-col-min:148px] lg:[--grid-col-min:0px]"
          >
            {/* Top-left Corner Cell */}
            <div className="sticky left-0 z-20 flex items-center justify-center border-b border-r border-line bg-surface-secondary/95 backdrop-blur-sm px-2 py-2.5">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-muted">
                Пара
              </span>
            </div>

            {/* Day Column Headers */}
            {days.map((day) => {
              const isToday = day.isoDate === todayIso;
              const isSelected = day.isoDate === selectedIso;
              const shortDay = DAY_NAMES_UA_SHORT[day.dayNumber] ?? day.dayName.slice(0, 2);
              const shortDate = formatShortDateUa(day.isoDate);

              return (
                <button
                  key={day.isoDate}
                  type="button"
                  onClick={() => onSelectDate(day.isoDate)}
                  aria-pressed={isSelected}
                  className={cn(
                    'relative flex flex-col items-start justify-center border-b border-r last:border-r-0 border-line px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-elevated/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                    isToday && 'bg-surface-elevated/30',
                    isSelected && !isToday && 'bg-amber-soft/35'
                  )}
                >
                  {isToday && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 top-0 h-[2px] bg-amber"
                    />
                  )}
                  <div className="flex w-full items-center justify-between gap-1.5">
                    <span
                      className={cn(
                        'text-xs font-semibold tracking-[-0.01em]',
                        isToday || isSelected ? 'text-amber-fg' : 'text-ink'
                      )}
                    >
                      {shortDay}
                    </span>
                    <span className="font-mono text-[10.5px] font-medium tabular-nums text-ink-secondary">
                      {shortDate}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[10.5px] text-ink-muted">
                      {day.lessons.length > 0 ? `${day.lessons.length} пар.` : 'Вільно'}
                    </span>
                    {isToday && (
                      <span className="inline-flex items-center rounded bg-amber-soft px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.04em] text-amber-fg">
                        Сьогодні
                      </span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Time Slot Rows */}
            {visibleSlots.map((slot, rowIndex) => {
              const isLastRow = rowIndex === visibleSlots.length - 1;

              return (
                <React.Fragment key={slot.order}>
                  {/* Left Sticky Time Gutter */}
                  <div
                    className={cn(
                      'sticky left-0 z-10 flex flex-col items-center justify-center border-r border-line bg-surface/95 backdrop-blur-sm px-1.5 py-2.5 text-center',
                      !isLastRow && 'border-b border-line/75'
                    )}
                  >
                    <span className="font-mono text-xs font-semibold tabular-nums text-ink">
                      {String(slot.order).padStart(2, '0')}
                    </span>
                    <span className="mt-1 font-mono text-[10px] leading-tight tabular-nums text-ink-secondary">
                      {slot.startTime}
                    </span>
                    <span className="font-mono text-[9.5px] leading-tight tabular-nums text-ink-muted">
                      {slot.endTime}
                    </span>
                  </div>

                  {/* Day Cells for this Time Slot */}
                  {days.map((day) => {
                    const isToday = day.isoDate === todayIso;
                    const slotLessons = day.lessonsByOrder[slot.order] ?? [];

                    return (
                      <div
                        key={`${day.isoDate}-${slot.order}`}
                        className={cn(
                          'min-w-0 p-1.5 border-r last:border-r-0 border-line/75',
                          !isLastRow && 'border-b border-line/75',
                          isToday && 'bg-surface-elevated/30'
                        )}
                      >
                        {slotLessons.length === 0 ? (
                          <div
                            aria-hidden="true"
                            className="flex h-full min-h-[76px] items-center justify-center rounded-xl border border-transparent text-xs text-ink-muted/35 select-none"
                          >
                            ·
                          </div>
                        ) : (
                          <div
                            className={cn(
                              'grid h-full gap-1',
                              slotLessons.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
                            )}
                          >
                            {slotLessons.map((lesson) => {
                              const isCurrent =
                                currentLessonId === lesson.id &&
                                day.isoDate === todayIso;
                              const attendance = getAttendanceStatus(
                                lesson.id,
                                day.isoDate
                              );
                              const noteCount = getNoteCountForLesson(
                                lesson.id,
                                day.isoDate
                              );
                              const teacher = teachersMap.get(lesson.teacherId);
                              const classroom = classroomsMap.get(lesson.classroomId);
                              const surname = getTeacherSurname(teacher);
                              const attendanceMeta = attendance
                                ? ATTENDANCE_DOT_META[attendance]
                                : null;

                              return (
                                <button
                                  key={lesson.id}
                                  type="button"
                                  onClick={() =>
                                    setActiveCell({
                                      lesson,
                                      dateIso: day.isoDate,
                                      dayNumber: day.dayNumber,
                                    })
                                  }
                                  className={cn(
                                    'group relative flex h-full min-h-[76px] w-full flex-col justify-between overflow-hidden rounded-xl p-2.5 pl-3 text-left transition-all duration-150 active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
                                    isCurrent
                                      ? 'glass-amber-lit'
                                      : 'border border-line/85 bg-surface-secondary/90 hover:border-line-strong hover:bg-surface-elevated/75'
                                  )}
                                >
                                  {/* Left 3px Semantic Stripe */}
                                  <span
                                    aria-hidden="true"
                                    className={cn(
                                      'absolute inset-y-0 left-0 w-[3px]',
                                      STRIPE_CLASS_BY_TYPE[lesson.type]
                                    )}
                                  />

                                  {/* Top Row: Subject & Status Indicators */}
                                  <div className="flex items-start justify-between gap-1.5">
                                    <span className="line-clamp-2 font-serif text-[12px] font-semibold leading-[1.3] text-ink">
                                      {lesson.name}
                                    </span>

                                    <div className="flex shrink-0 items-center gap-1 pt-0.5">
                                      {isCurrent && (
                                        <StatusDot
                                          tone="amber"
                                          pulse
                                          size="sm"
                                          label="Зараз триває"
                                        />
                                      )}
                                      {attendanceMeta && (
                                        <span title={`Відмітка: ${attendanceMeta.label}`}>
                                          <StatusDot
                                            tone={attendanceMeta.tone}
                                            size="sm"
                                            label={`Відмітка: ${attendanceMeta.label}`}
                                          />
                                        </span>
                                      )}
                                      {noteCount > 0 && (
                                        <span
                                          title={`Нотаток: ${noteCount}`}
                                          aria-label={`Нотаток: ${noteCount}`}
                                          className="inline-flex items-center gap-0.5 rounded bg-amber-soft px-1 py-0.5 font-mono text-[9.5px] font-semibold leading-none text-amber-fg"
                                        >
                                          <Note className="h-2.5 w-2.5" weight="regular" aria-hidden="true" />
                                          <span>{noteCount}</span>
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  {/* Bottom Row: Room Code & Teacher Surname */}
                                  <div className="mt-2 flex items-center justify-between gap-1.5 text-[10.5px] text-ink-secondary">
                                    <span className="font-mono font-medium tabular-nums text-ink shrink-0">
                                      {getClassroomCodeLabel(classroom)}
                                    </span>
                                    <span className="truncate text-right">
                                      {surname}
                                    </span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      {/* Lesson Detail ModalDrawer */}
      <ModalDrawer
        open={activeCell !== null}
        onClose={() => setActiveCell(null)}
        title={activeLesson?.name}
        description={
          activeCell && activeLesson
            ? `${formatFullDateUa(activeCell.dateIso, activeCell.dayNumber)} · ${activeLesson.startTime} – ${activeLesson.endTime} · ${activeLesson.order} пара`
            : undefined
        }
        footer={
          activeLesson && (
            <button
              type="button"
              onClick={() => {
                const targetLesson = activeLesson;
                const targetDate = activeDateIso;
                setActiveCell(null);
                onOpenNotes(targetLesson, targetDate);
              }}
              className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber/35 bg-amber-soft px-4 py-2 text-sm font-semibold text-amber-fg transition-colors duration-150 hover:border-amber/60 hover:bg-amber/20 active:scale-[0.98]"
            >
              <Note className="h-4 w-4 shrink-0" weight="regular" aria-hidden="true" />
              <span>Нотатки та дедлайни</span>
              {activeNoteCount > 0 && (
                <span className="inline-flex min-w-[20px] items-center justify-center rounded-md bg-amber px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[#242522] leading-none">
                  {activeNoteCount}
                </span>
              )}
            </button>
          )
        }
      >
        {activeLesson && (
          <div className="space-y-4">
            {/* Semantic Metadata Chips */}
            <div className="flex flex-wrap items-center gap-1.5">
              <LessonTypeBadge type={activeLesson.type} />

              {isActiveCellLive && (
                <MetaChip
                  variant="amber"
                  icon={<StatusDot tone="amber" pulse size="sm" />}
                >
                  Зараз триває
                </MetaChip>
              )}

              {activeLesson.subgroup && (
                <MetaChip variant="beige" mono>
                  Підгр. {activeLesson.subgroup}
                </MetaChip>
              )}

              {activeLesson.weekType !== 'both' && (
                <MetaChip variant="neutral" mono>
                  {activeLesson.weekType === 'numerator' ? 'Чисельник' : 'Знаменник'}
                </MetaChip>
              )}

              {activeLesson.isElective && (
                <MetaChip
                  variant="amber"
                  icon={<Sparkle className="h-3 w-3" weight="regular" />}
                >
                  Вибіркова
                </MetaChip>
              )}

              {activeLesson.departments && activeLesson.departments.length > 0 && (
                <MetaChip variant="neutral" mono>
                  {activeLesson.departments.map((d) => d.toUpperCase()).join(' / ')}
                </MetaChip>
              )}
            </div>

            {/* Teacher & Classroom Details */}
            <div className="rounded-xl border border-line bg-surface-elevated/55 p-3.5 space-y-2.5">
              <div className="flex items-start gap-2.5">
                <User
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-secondary"
                  weight="regular"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-ink-secondary">
                    Викладач
                  </span>
                  <span className="block text-sm font-medium text-ink">
                    {activeTeacher?.fullName?.trim() && !/^t_/.test(activeTeacher.fullName.trim()) ? activeTeacher.fullName.trim() : 'Викладача не вказано'}
                  </span>
                  {activeTeacher?.department && (
                    <span className="block text-xs text-ink-secondary">
                      Кафедра {activeTeacher.department}
                    </span>
                  )}
                </div>
              </div>

              <div className="h-px bg-line/70" />

              <div className="flex items-start gap-2.5">
                <MapPin
                  className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg"
                  weight="regular"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium text-ink-secondary">
                    Аудиторія
                  </span>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="font-mono text-sm font-semibold text-ink tabular-nums">
                      {getClassroomCodeLabel(activeClassroom)}
                    </span>
                    {activeClassroom && (
                      <span className="text-xs text-ink-secondary">
                        {activeClassroom.building}{activeClassroom.floor != null ? `, ${activeClassroom.floor} пов.` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Tactile Attendance Controls */}
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-ink-secondary">
                  Відвідуваність за {formatShortDateUa(activeDateIso)}
                </span>
                {activeAttendance && (
                  <span className="font-mono text-[11px] font-medium text-ink-secondary">
                    {ATTENDANCE_DOT_META[activeAttendance].label}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2">
                {ATTENDANCE_BUTTONS.map(({ status, label, Icon, activeStyle }) => {
                  const isSelected = activeAttendance === status;

                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() =>
                        onToggleAttendance(activeLesson.id, activeDateIso, status)
                      }
                      aria-pressed={isSelected}
                      style={isSelected ? activeStyle : undefined}
                      className={cn(
                        'inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all duration-150 active:scale-[0.97]',
                        isSelected
                          ? 'shadow-elevated'
                          : 'border-line bg-surface-elevated/80 text-ink-secondary hover:border-line-strong hover:text-ink'
                      )}
                    >
                      <Icon
                        className="h-3.5 w-3.5 shrink-0"
                        weight={status === 'excused' ? 'regular' : 'bold'}
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </ModalDrawer>
    </>
  );
};
