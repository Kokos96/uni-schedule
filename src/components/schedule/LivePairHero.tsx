import React from 'react';
import {
  Check,
  Clock,
  Coffee,
  MapPin,
  Note,
  Plus,
  Sparkle,
  Sun,
  User,
  X,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import { useCurrentPair, type CurrentPairState } from '../../hooks/useCurrentPair';
import type {
  AttendanceStatus,
  Classroom,
  Lesson,
  Teacher,
} from '../../types';
import { cn } from '../../utils/cn';
import { AnimatedProgressBar } from '../motion/MotionPrimitives';
import { LessonTypeBadge, MetaChip, StatusDot } from '../ui/Badge';
import { EditorialUnderline } from '../ui/EditorialOrnaments';
import { GlassCard } from '../ui/GlassCard';

const EMPTY_LESSONS: readonly Lesson[] = [];

export interface LivePairHeroProps {
  currentPair?: CurrentPairState;
  todayLessons?: readonly Lesson[];
  teachersMap: Map<string, Teacher>;
  classroomsMap: Map<string, Classroom>;
  todayIso: string;
  getStatus: (lessonId: string, date: string) => AttendanceStatus | null;
  onToggleAttendance: (
    lessonId: string,
    date: string,
    status: AttendanceStatus
  ) => void;
  onOpenNotes: (lesson: Lesson, date: string) => void;
  noteCountMap?: Map<string, number> | Record<string, number>;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getNoteCount(
  noteCountMap: Map<string, number> | Record<string, number> | undefined,
  lessonId: string
): number {
  if (!noteCountMap) return 0;
  if (noteCountMap instanceof Map) {
    return noteCountMap.get(lessonId) ?? 0;
  }
  return noteCountMap[lessonId] ?? 0;
}

const QUICK_ATTENDANCE: Array<{
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

export const LivePairHero: React.FC<LivePairHeroProps> = ({
  currentPair,
  todayLessons,
  teachersMap,
  classroomsMap,
  todayIso,
  getStatus,
  onToggleAttendance,
  onOpenNotes,
  noteCountMap,
}) => {
  const livePair = useCurrentPair(
    todayLessons ?? EMPTY_LESSONS,
    todayLessons !== undefined,
    { liveCountdown: true }
  );
  const activePair =
    todayLessons !== undefined ? livePair : (currentPair ?? livePair);

  const {
    status,
    currentLesson,
    nextLesson,
    elapsedMinutes,
    remainingMinutes,
    remainingSeconds,
    progressPercent,
    secondsUntilNext,
    currentTimeStr,
  } = activePair;

  const focusLesson =
    status === 'in_lesson'
      ? currentLesson
      : status === 'break' || status === 'before_first'
        ? nextLesson
        : undefined;

  const teacher = focusLesson ? teachersMap.get(focusLesson.teacherId) : undefined;
  const classroom = focusLesson
    ? classroomsMap.get(focusLesson.classroomId)
    : undefined;
  const attendanceStatus = focusLesson
    ? getStatus(focusLesson.id, todayIso)
    : null;
  const noteCount = focusLesson ? getNoteCount(noteCountMap, focusLesson.id) : 0;

  // 1. In Lesson or Break (Active live timer states)
  if ((status === 'in_lesson' || status === 'break') && focusLesson) {
    const isLesson = status === 'in_lesson';
    const countdownValue = isLesson ? remainingSeconds : secondsUntilNext;
    const pairOrder = String(focusLesson.order).padStart(2, '0');

    return (
      <GlassCard variant="amber-lit" brackets padding="lg" className="space-y-4">
        {/* Top status & clock row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusDot
              tone={isLesson ? 'amber' : 'sage'}
              pulse
              size="md"
              label={isLesson ? 'Триває пара' : 'Триває перерва'}
            />
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-fg">
              {isLesson ? 'Зараз триває пара' : 'Перерва між парами'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-ink-secondary">
              {currentTimeStr}
            </span>
            <MetaChip variant="amber" mono>
              №{pairOrder} · {focusLesson.startTime}–{focusLesson.endTime}
            </MetaChip>
          </div>
        </div>

        {/* Countdown + progress */}
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <div className="flex items-baseline gap-2.5">
              <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-ink sm:text-[34px]">
                {formatCountdown(countdownValue)}
              </span>
              <span className="text-xs font-medium text-ink-secondary">
                {isLesson ? 'до завершення' : 'до початку пари'}
              </span>
            </div>

            <span className="font-mono text-xs font-medium tabular-nums text-amber-fg">
              {Math.round(progressPercent)}%
            </span>
          </div>

          <AnimatedProgressBar
            value={progressPercent}
            label={
              isLesson
                ? `Прогрес пари: ${Math.round(progressPercent)}%`
                : `Прогрес перерви: ${Math.round(progressPercent)}%`
            }
          />

          <div className="flex items-center justify-between text-[11px] text-ink-secondary">
            <span>Минуло {elapsedMinutes} хв</span>
            <span>Залишилось ~{remainingMinutes} хв</span>
          </div>
        </div>

        {/* Subject & logistics */}
        <div className="rounded-xl border border-line/70 bg-surface/65 p-3.5">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-muted">
              {isLesson ? 'Поточна дисципліна' : 'Наступна пара'}
            </span>
            <LessonTypeBadge type={focusLesson.type} compact />
          </div>

          <h2 className="font-serif text-lg font-medium leading-snug text-ink">
            {focusLesson.name}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-secondary">
            {classroom && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-fg" weight="regular" aria-hidden="true" />
                <span>
                  <strong className="font-mono font-semibold text-ink">
                    {classroom.code}
                  </strong>{' '}
                  · {classroom.building}
                </span>
              </span>
            )}
            {teacher && (
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5 shrink-0 text-ink-muted" weight="regular" aria-hidden="true" />
                <span>{teacher.fullName}</span>
              </span>
            )}
          </div>
        </div>

        {/* Quick inline attendance + + Нотатка */}
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex flex-1 items-center gap-1.5"
            role="group"
            aria-label="Швидка відмітка відвідуваності"
          >
            {QUICK_ATTENDANCE.map(({ status: attStatus, label, Icon, activeStyle }) => {
              const isSelected = attendanceStatus === attStatus;
              return (
                <button
                  key={attStatus}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onToggleAttendance(focusLesson.id, todayIso, attStatus)}
                  style={isSelected ? activeStyle : undefined}
                  className={cn(
                    'inline-flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-xl border px-2.5 text-xs font-medium transition-all duration-150 active:scale-[0.97]',
                    isSelected
                      ? 'font-semibold shadow-elevated'
                      : 'border-line bg-surface/80 text-ink-secondary hover:border-line-strong hover:text-ink'
                  )}
                >
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    weight={attStatus === 'excused' ? 'regular' : 'bold'}
                    aria-hidden="true"
                  />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => onOpenNotes(focusLesson, todayIso)}
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber/35 bg-amber-soft px-3 text-xs font-semibold text-amber-fg transition-colors hover:border-amber/60 hover:bg-amber/20 active:scale-[0.97]"
          >
            {noteCount > 0 ? (
              <>
                <Note className="h-3.5 w-3.5 shrink-0" weight="regular" aria-hidden="true" />
                <span>Нотатки ({noteCount})</span>
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5 shrink-0" weight="bold" aria-hidden="true" />
                <span>Нотатка</span>
              </>
            )}
          </button>
        </div>

        {isLesson && nextLesson && (
          <div className="flex items-center justify-between gap-2 border-t border-line/60 pt-2.5 text-xs text-ink-secondary">
            <span className="truncate">
              Далі о{' '}
              <span className="font-mono font-medium tabular-nums text-ink">
                {nextLesson.startTime}
              </span>
              : {nextLesson.name}
            </span>
          </div>
        )}
      </GlassCard>
    );
  }

  // 2. Before First Lesson
  if (status === 'before_first' && nextLesson) {
    return (
      <GlassCard variant="amber-lit" brackets padding="lg" className="space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusDot tone="amber" pulse size="md" />
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-fg">
              До першої пари
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums text-ink-secondary">
            {currentTimeStr}
          </span>
        </div>

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-mono text-3xl font-semibold tracking-tight tabular-nums text-ink">
            {formatCountdown(secondsUntilNext)}
          </span>
          <MetaChip variant="amber" mono>
            Початок о {nextLesson.startTime}
          </MetaChip>
        </div>

        <div className="rounded-xl border border-line/70 bg-surface/65 p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium text-ink-muted">
              Перша пара дня
            </span>
            <LessonTypeBadge type={nextLesson.type} compact />
          </div>
          <p className="font-serif text-base font-medium text-ink">
            {nextLesson.name}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-secondary">
            <div className="flex flex-wrap items-center gap-3">
              {classroom && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5 text-amber-fg" weight="regular" aria-hidden="true" />
                  <strong className="font-mono text-ink">{classroom.code}</strong>
                  <span>· {classroom.building}</span>
                </span>
              )}
              {teacher && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-3.5 w-3.5 text-ink-muted" weight="regular" aria-hidden="true" />
                  <span>{teacher.fullName}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => onOpenNotes(nextLesson, todayIso)}
              className="inline-flex items-center gap-1 rounded-lg border border-amber/30 bg-amber-soft px-2.5 py-1 text-[11px] font-semibold text-amber-fg transition-colors hover:border-amber/55"
            >
              <Plus className="h-3 w-3" weight="bold" aria-hidden="true" />
              <span>Нотатка</span>
            </button>
          </div>
        </div>
      </GlassCard>
    );
  }

  // 3. After Last Lesson
  if (status === 'after_last') {
    return (
      <GlassCard variant="amber-lit" brackets padding="lg" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StatusDot tone="sage" size="md" />
            <span className="text-xs font-semibold uppercase tracking-[0.06em] text-sage-fg">
              Навчальний день завершено
            </span>
          </div>
          <span className="font-mono text-xs tabular-nums text-ink-secondary">
            {currentTimeStr}
          </span>
        </div>

        <div className="flex items-start gap-3 pt-0.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-sage/30 bg-sage-soft text-sage-fg">
            <Sparkle className="h-5 w-5" weight="duotone" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-medium text-ink">
              Усі пари на сьогодні позаду
            </h2>
            <EditorialUnderline width={84} className="mt-1.5" />
            <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
              Гарний час, щоб переглянути нотатки, відмітити відвідуваність або закрити актуальні дедлайни.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  // 4. No Classes (weekend / free day / viewing non-today)
  return (
    <GlassCard variant="amber-lit" brackets padding="lg" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <StatusDot tone="neutral" size="md" />
          <span className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
            Спокійний режим
          </span>
        </div>
        <span className="font-mono text-xs tabular-nums text-ink-secondary">
          {currentTimeStr}
        </span>
      </div>

      <div className="flex items-start gap-3 pt-0.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber/30 bg-amber-soft text-amber-fg">
          {currentTimeStr >= '18:00' ? (
            <Coffee className="h-5 w-5" weight="duotone" aria-hidden="true" />
          ) : (
            <Sun className="h-5 w-5" weight="duotone" aria-hidden="true" />
          )}
        </div>
        <div>
          <h2 className="font-serif text-lg font-medium text-ink">
            Сьогодні занять за розкладом немає
          </h2>
          <EditorialUnderline width={84} className="mt-1.5" />
          <p className="mt-2 text-xs leading-relaxed text-ink-secondary">
            Живий таймер автоматично активується в день проведення пар за вашим профілем.
          </p>
        </div>
      </div>
    </GlassCard>
  );
};
