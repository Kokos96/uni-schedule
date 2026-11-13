import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronDown,
  Clock,
  GraduationCap,
  MapPin,
  Search,
  User,
  X,
} from 'lucide-react';
import {
  REDUCED_MOTION_TRANSITION,
  expandCollapseVariants,
  useAppReducedMotion,
} from '../../lib/motion';
import type { Classroom, Lesson, ScheduleDay, Teacher } from '../../types';
import { cn } from '../../utils/cn';
import {
  classroomsMap as defaultClassroomsMap,
  scheduleData as defaultScheduleData,
  teachersData as defaultTeachersData,
} from '../../utils/schedule';
import { StaggerCard, StaggerList } from '../motion/MotionPrimitives';
import { LessonTypeBadge, MetaChip } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';

export interface TeachersListProps {
  teachers?: readonly Teacher[];
  schedule?: readonly ScheduleDay[];
  classroomsMap?: Map<string, Classroom>;
}

interface TeacherScheduleSlot {
  dayNumber: number;
  dayName: string;
  lesson: Lesson;
  classroom?: Classroom;
}

export const TeachersList: React.FC<TeachersListProps> = ({
  teachers = defaultTeachersData,
  schedule = defaultScheduleData,
  classroomsMap = defaultClassroomsMap,
}) => {
  const reducedMotion = useAppReducedMotion();
  const [query, setQuery] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const slotsByTeacherId = useMemo(() => {
    const map = new Map<string, TeacherScheduleSlot[]>();

    for (const day of schedule) {
      for (const lesson of day.lessons) {
        const list = map.get(lesson.teacherId) ?? [];
        list.push({
          dayNumber: day.dayNumber,
          dayName: day.dayName,
          lesson,
          classroom: classroomsMap.get(lesson.classroomId),
        });
        map.set(lesson.teacherId, list);
      }
    }

    for (const [teacherId, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
        return a.lesson.order - b.lesson.order;
      });
      map.set(teacherId, list);
    }

    return map;
  }, [schedule, classroomsMap]);

  const filteredTeachers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...teachers].sort((a, b) =>
      a.fullName.localeCompare(b.fullName, 'uk')
    );

    if (!q) return list;
    return list.filter((teacher) => {
      if (teacher.fullName.toLowerCase().includes(q)) return true;
      if (teacher.department.toLowerCase().includes(q)) return true;
      return teacher.subjects.some((subj) => subj.toLowerCase().includes(q));
    });
  }, [teachers, query]);

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <Search
          className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-muted"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Пошук викладача за ПІБ або предметом..."
          aria-label="Пошук викладачів"
          className="w-full rounded-xl border border-line bg-surface py-2.5 pr-9 pl-10 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Очистити пошук"
            className="absolute top-1/2 right-2.5 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      {filteredTeachers.length === 0 ? (
        <GlassCard variant="matte" padding="none">
          <EmptyState
            compact
            title="Викладачів не знайдено"
            description="Перевірте правопис прізвища або назви дисципліни."
            action={{
              label: 'Скинути пошук',
              onClick: () => setQuery(''),
            }}
          />
        </GlassCard>
      ) : (
        <StaggerList
          itemCount={filteredTeachers.length}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          {filteredTeachers.map((teacher) => {
            const slots = slotsByTeacherId.get(teacher.id) ?? [];
            const isExpanded = expandedId === teacher.id;

            return (
              <StaggerCard key={teacher.id} interactive={false}>
                <GlassCard
                  variant={isExpanded ? 'glass' : 'matte'}
                  padding="none"
                  className={cn(
                    'overflow-hidden transition-colors',
                    isExpanded && 'border-amber/35'
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedId((prev) =>
                        prev === teacher.id ? null : teacher.id
                      )
                    }
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-elevated/40"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MetaChip
                          variant="beige"
                          icon={<GraduationCap className="h-3 w-3" />}
                        >
                          {teacher.department}
                        </MetaChip>
                        <MetaChip variant="neutral" mono>
                          {slots.length}{' '}
                          {slots.length === 1
                            ? 'пара'
                            : slots.length < 5
                              ? 'пари'
                              : 'пар'}
                        </MetaChip>
                      </div>

                      <div className="flex items-center gap-2">
                        <User
                          className="h-4 w-4 shrink-0 text-amber-fg"
                          aria-hidden="true"
                        />
                        <h3 className="font-serif text-[17px] font-medium leading-snug text-ink">
                          {teacher.fullName}
                        </h3>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {teacher.subjects.map((subject) => (
                          <MetaChip key={subject} variant="amber">
                            {subject}
                          </MetaChip>
                        ))}
                      </div>
                    </div>

                    <span
                      className={cn(
                        'mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-elevated/70 text-ink-secondary transition-transform duration-200',
                        isExpanded && 'rotate-180 border-amber/35 text-amber-fg'
                      )}
                      aria-hidden="true"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="slots"
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
                            : expandCollapseVariants
                        }
                        initial="initial"
                        animate="animate"
                        exit="exit"
                        className="border-t border-line/70 bg-surface-elevated/35 px-4 py-3"
                      >
                        {slots.length === 0 ? (
                          <p className="text-xs text-ink-secondary">
                            Пар у розкладі не знайдено.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                              Розклад занять викладача
                            </p>
                            <ul className="space-y-2">
                              {slots.map((slot) => (
                                <li
                                  key={slot.lesson.id}
                                  className="rounded-xl border border-line/70 bg-surface/85 px-3 py-2.5"
                                >
                                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-semibold text-ink">
                                        {slot.dayName}
                                      </span>
                                      <span className="inline-flex items-center gap-1 font-mono text-[11px] tabular-nums text-ink-secondary">
                                        <Clock
                                          className="h-3 w-3 text-amber-fg"
                                          aria-hidden="true"
                                        />
                                        {slot.lesson.startTime}–
                                        {slot.lesson.endTime}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1.5">
                                      {slot.lesson.subgroup && (
                                        <MetaChip variant="beige">
                                          Підгр. {slot.lesson.subgroup}
                                        </MetaChip>
                                      )}
                                      <LessonTypeBadge
                                        type={slot.lesson.type}
                                        compact
                                      />
                                    </div>
                                  </div>

                                  <p className="text-xs font-medium text-ink">
                                    {slot.lesson.name}
                                  </p>

                                  {slot.classroom && (
                                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-secondary">
                                      <MapPin
                                        className="h-3 w-3 shrink-0 text-amber-fg"
                                        aria-hidden="true"
                                      />
                                      <span>
                                        Ауд.{' '}
                                        <strong className="font-mono text-ink">
                                          {slot.classroom.code}
                                        </strong>{' '}
                                        · {slot.classroom.building}
                                      </span>
                                    </div>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>
              </StaggerCard>
            );
          })}
        </StaggerList>
      )}
    </div>
  );
};
