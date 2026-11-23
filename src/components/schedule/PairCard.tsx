import React from 'react';
import {
  Calendar,
  Check,
  Clock,
  MapPin,
  Note,
  User,
  X,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import type {
  AttendanceStatus,
  Classroom,
  DepartmentType,
  Lesson,
  Teacher,
} from '../../types';
import { cn } from '../../utils/cn';
import { LessonTypeBadge, MetaChip, StatusDot } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';

export interface PairCardProps {
  lesson: Lesson;
  teacher?: Teacher;
  classroom?: Classroom;
  isCurrent?: boolean;
  attendanceStatus: AttendanceStatus | null;
  onToggleAttendance: (status: AttendanceStatus) => void;
  noteCount?: number;
  activeDeadlineLabel?: string | null;
  onOpenNotes: () => void;
}

const DEPARTMENT_SHORT_LABELS: Record<DepartmentType, string> = {
  sp: 'СП',
  oit: 'ОІТ',
  rks: 'РКС',
  rkt: 'РКТ',
};

const ATTENDANCE_OPTIONS: Array<{
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

export const PairCard: React.FC<PairCardProps> = ({
  lesson,
  teacher,
  classroom,
  isCurrent = false,
  attendanceStatus,
  onToggleAttendance,
  noteCount = 0,
  activeDeadlineLabel = null,
  onOpenNotes,
}) => {
  const pairOrder = String(lesson.order).padStart(2, '0');
  const parityLabel =
    lesson.weekType === 'numerator'
      ? 'Чисельник'
      : lesson.weekType === 'denominator'
        ? 'Знаменник'
        : null;

  const departmentsLabel =
    lesson.departments && lesson.departments.length > 0
      ? lesson.departments.map((d) => DEPARTMENT_SHORT_LABELS[d]).join(' · ')
      : null;

  const hasIndicators = noteCount > 0 || Boolean(activeDeadlineLabel);
  const classroomCode = classroom?.code?.trim();
  const hasClassroomCode = Boolean(
    classroomCode && classroomCode !== '—' && !/^c_/.test(classroomCode)
  );
  const teacherName = teacher?.fullName?.trim();
  const displayTeacher =
    teacherName && !/^t_/.test(teacherName)
      ? teacherName
      : 'Викладача не вказано';

  return (
    <GlassCard
      variant={isCurrent ? 'amber-lit' : 'matte'}
      brackets={isCurrent}
      interactive
      padding="md"
      className={cn(
        'transition-shadow duration-200',
        isCurrent && 'shadow-amber-glow'
      )}
    >
      {/* Top row: order + time + badges */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'inline-flex h-6 min-w-[1.75rem] items-center justify-center rounded-md border px-1.5 font-mono text-[11px] font-semibold tabular-nums',
              isCurrent
                ? 'border-amber/40 bg-amber-soft text-amber-fg'
                : 'border-line bg-surface-elevated text-ink-secondary'
            )}
          >
            {pairOrder}
          </span>

          <span className="font-mono text-xs font-medium tabular-nums text-ink-secondary">
            {lesson.startTime} – {lesson.endTime}
          </span>

          {isCurrent && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber/35 bg-amber-soft px-2 py-0.5 text-[11px] font-semibold text-amber-fg">
              <StatusDot tone="amber" pulse size="sm" />
              <span>Зараз</span>
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {lesson.subgroup && (
            <MetaChip variant="beige">Підгр. {lesson.subgroup}</MetaChip>
          )}
          {lesson.isElective && <MetaChip variant="amber">Вибіркова</MetaChip>}
          {parityLabel && <MetaChip variant="neutral">{parityLabel}</MetaChip>}
          {departmentsLabel && (
            <MetaChip variant="neutral">{departmentsLabel}</MetaChip>
          )}
          <LessonTypeBadge type={lesson.type} />
        </div>
      </div>

      {/* Subject title */}
      <h3 className="font-serif text-[17px] font-medium leading-[1.35] tracking-[-0.01em] text-ink">
        {lesson.name}
      </h3>

      {/* Classroom & teacher metadata */}
      <div className="mt-2.5 space-y-1.5 text-xs text-ink-secondary">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-amber-fg" weight="regular" aria-hidden="true" />
          <span className="min-w-0 truncate">
            {hasClassroomCode ? (
              <>
                Ауд.{' '}
                <strong className="font-mono font-semibold text-ink">
                  {classroomCode}
                </strong>
                {classroom?.building && (
                  <span className="text-ink-secondary"> · {classroom.building}</span>
                )}
              </>
            ) : (
              <span className="text-ink-secondary">Аудиторію не вказано</span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0 text-ink-muted" weight="regular" aria-hidden="true" />
          <span className="min-w-0 truncate text-ink-secondary">
            {displayTeacher}
          </span>
        </div>
      </div>

      {/* Inline note & deadline indicator pill */}
      {hasIndicators && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenNotes}
            className="inline-flex items-center gap-2 rounded-xl border border-line bg-surface-elevated/80 px-2.5 py-1.5 text-[11px] font-medium text-ink-secondary transition-colors hover:border-amber/40 hover:text-ink active:scale-[0.98]"
          >
            {noteCount > 0 && (
              <span className="inline-flex items-center gap-1 text-amber-fg">
                <Note className="h-3 w-3 shrink-0" weight="regular" aria-hidden="true" />
                <span>
                  {noteCount}{' '}
                  {noteCount === 1
                    ? 'нотатка'
                    : noteCount < 5
                      ? 'нотатки'
                      : 'нотаток'}
                </span>
              </span>
            )}
            {noteCount > 0 && activeDeadlineLabel && (
              <span className="text-line-strong" aria-hidden="true">
                ·
              </span>
            )}
            {activeDeadlineLabel && (
              <span className="inline-flex items-center gap-1 text-terracotta-fg">
                <Calendar className="h-3 w-3 shrink-0" weight="regular" aria-hidden="true" />
                <span>Дедлайн: {activeDeadlineLabel}</span>
              </span>
            )}
          </button>
        </div>
      )}

      {/* Attendance & Notes actions */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
        <div className="flex flex-1 items-center gap-1.5" role="group" aria-label="Відмітка відвідуваності">
          {ATTENDANCE_OPTIONS.map(({ status, label, Icon, activeStyle }) => {
            const isSelected = attendanceStatus === status;
            return (
              <button
                key={status}
                type="button"
                aria-pressed={isSelected}
                onClick={() => onToggleAttendance(status)}
                style={isSelected ? activeStyle : undefined}
                className={cn(
                  'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-xs font-medium transition-all duration-150 active:scale-[0.97]',
                  isSelected
                    ? 'font-semibold shadow-elevated'
                    : 'border-line bg-surface-elevated/70 text-ink-secondary hover:border-line-strong hover:text-ink'
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

        <button
          type="button"
          onClick={onOpenNotes}
          aria-label={`Нотатки до пари ${lesson.name}`}
          className={cn(
            'inline-flex min-h-[44px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all duration-150 active:scale-[0.97]',
            noteCount > 0
              ? 'border-amber/35 bg-amber-soft text-amber-fg hover:border-amber/55'
              : 'border-line bg-surface-elevated/70 text-ink-secondary hover:border-line-strong hover:text-ink'
          )}
        >
          <Note className="h-3.5 w-3.5 shrink-0" weight="regular" aria-hidden="true" />
          <span className="hidden xs:inline">Нотатки</span>
          {noteCount > 0 && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber/20 px-1 font-mono text-[10px] font-semibold tabular-nums text-amber-fg">
              {noteCount}
            </span>
          )}
        </button>
      </div>
    </GlassCard>
  );
};
