import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Building2,
  ChevronDown,
  Clock,
  Layers,
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
  classroomsData as defaultClassroomsData,
  scheduleData as defaultScheduleData,
  teachersMap as defaultTeachersMap,
} from '../../utils/schedule';
import { StaggerCard, StaggerList } from '../motion/MotionPrimitives';
import { LessonTypeBadge, MetaChip } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';

export interface ClassroomsListProps {
  classrooms?: readonly Classroom[];
  schedule?: readonly ScheduleDay[];
  teachersMap?: Map<string, Teacher>;
}

const BUILDING_FILTERS = [
  'Всі',
  'вул. Драгоманова',
  'вул. Тарнавського',
  'Головний корпус',
] as const;

type BuildingFilter = (typeof BUILDING_FILTERS)[number];

interface ClassroomLessonSlot {
  dayNumber: number;
  dayName: string;
  lesson: Lesson;
  teacher?: Teacher;
}

export const ClassroomsList: React.FC<ClassroomsListProps> = ({
  classrooms = defaultClassroomsData,
  schedule = defaultScheduleData,
  teachersMap = defaultTeachersMap,
}) => {
  const reducedMotion = useAppReducedMotion();
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<BuildingFilter>('Всі');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const lessonsByClassroomId = useMemo(() => {
    const map = new Map<string, ClassroomLessonSlot[]>();

    for (const day of schedule) {
      for (const lesson of day.lessons) {
        const list = map.get(lesson.classroomId) ?? [];
        list.push({
          dayNumber: day.dayNumber,
          dayName: day.dayName,
          lesson,
          teacher: teachersMap.get(lesson.teacherId),
        });
        map.set(lesson.classroomId, list);
      }
    }

    for (const [classroomId, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
        return a.lesson.order - b.lesson.order;
      });
      map.set(classroomId, list);
    }

    return map;
  }, [schedule, teachersMap]);

  const filteredClassrooms = useMemo(() => {
    const q = query.trim().toLowerCase();

    return [...classrooms]
      .filter((room) => {
        if (buildingFilter !== 'Всі' && room.building !== buildingFilter) {
          return false;
        }
        if (!q) return true;

        if (room.code.toLowerCase().includes(q)) return true;
        if (room.building.toLowerCase().includes(q)) return true;

        const roomSlots = lessonsByClassroomId.get(room.id) ?? [];
        return roomSlots.some((slot) =>
          slot.lesson.name.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.building !== b.building) {
          return a.building.localeCompare(b.building, 'uk');
        }
        return a.code.localeCompare(b.code, 'uk', { numeric: true });
      });
  }, [classrooms, buildingFilter, query, lessonsByClassroomId]);

  return (
    <div className="space-y-4">
      {/* Search + Building filter pills */}
      <div className="space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук аудиторії (напр. №14/Б, 302/l) або предмета..."
            aria-label="Пошук аудиторій"
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

        <div
          className="flex flex-wrap gap-1.5"
          role="group"
          aria-label="Фільтр за корпусом"
        >
          {BUILDING_FILTERS.map((building) => {
            const isActive = buildingFilter === building;
            return (
              <button
                key={building}
                type="button"
                aria-pressed={isActive}
                onClick={() => setBuildingFilter(building)}
                className={cn(
                  'inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-all active:scale-[0.97]',
                  isActive
                    ? 'border-amber/45 bg-amber-soft font-semibold text-amber-fg'
                    : 'border-line bg-surface text-ink-secondary hover:border-line-strong hover:text-ink'
                )}
              >
                {building !== 'Всі' && (
                  <Building2 className="h-3 w-3 shrink-0" aria-hidden="true" />
                )}
                <span>{building}</span>
              </button>
            );
          })}
        </div>
      </div>

      {filteredClassrooms.length === 0 ? (
        <GlassCard variant="matte" padding="none">
          <EmptyState
            compact
            title="Аудиторій не знайдено"
            description="Спробуйте змінити фільтр корпусу або пошуковий запит."
            action={{
              label: 'Скинути фільтри',
              onClick: () => {
                setQuery('');
                setBuildingFilter('Всі');
              },
            }}
          />
        </GlassCard>
      ) : (
        <StaggerList
          itemCount={filteredClassrooms.length}
          className="grid grid-cols-1 gap-3 md:grid-cols-2"
        >
          {filteredClassrooms.map((room) => {
            const slots = lessonsByClassroomId.get(room.id) ?? [];
            const isExpanded = expandedId === room.id;

            return (
              <StaggerCard key={room.id} interactive={false}>
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
                        prev === room.id ? null : room.id
                      )
                    }
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-surface-elevated/40"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <MetaChip
                          variant="amber"
                          mono
                          icon={<Layers className="h-3 w-3" />}
                        >
                          {room.floor} поверх
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
                        <MapPin
                          className="h-4 w-4 shrink-0 text-amber-fg"
                          aria-hidden="true"
                        />
                        <h3 className="font-mono text-lg font-semibold tracking-tight text-ink">
                          {room.code}
                        </h3>
                      </div>

                      <p className="flex items-center gap-1.5 text-xs text-ink-secondary">
                        <Building2
                          className="h-3.5 w-3.5 shrink-0 text-ink-muted"
                          aria-hidden="true"
                        />
                        <span>{room.building}</span>
                      </p>
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
                        key="room-slots"
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
                            Для цієї аудиторії пар у поточному розкладі не знайдено.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                              Пари в цій аудиторії
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

                                  {slot.teacher && (
                                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-secondary">
                                      <User
                                        className="h-3 w-3 shrink-0 text-ink-muted"
                                        aria-hidden="true"
                                      />
                                      <span>{slot.teacher.fullName}</span>
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
