import React, { useMemo, useState } from 'react';
import { MagnifyingGlass, Plus, X } from '@phosphor-icons/react';
import type {
  CreateDeadlineInput,
  DeadlineFilter,
  DeadlineItem,
  UpdateDeadlinePatch,
} from '../../types/notes';
import { formatIsoDate } from '../../utils/date';
import {
  type LessonFilterProfile,
  getSubjectsForSettings,
  scheduleData,
} from '../../utils/schedule';
import { StaggerList } from '../motion/MotionPrimitives';
import { MetaChip } from '../ui/Badge';
import {
  EditorialUnderline,
  EmptyNotesIllustration,
} from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useToast } from '../ui/Toast';
import { DeadlineCard } from './DeadlineCard';
import { DeadlineFormModal } from './DeadlineFormModal';

export interface DeadlinesViewProps {
  deadlines: DeadlineItem[];
  onAddDeadline: (input: CreateDeadlineInput) => DeadlineItem;
  onToggleDeadline: (id: string) => void;
  onUpdateDeadline: (id: string, patch: UpdateDeadlinePatch) => void;
  onDeleteDeadline: (id: string) => void;
  settings?: LessonFilterProfile;
  todayIso?: string;
}

function getAllScheduleSubjects(): string[] {
  const names = new Set<string>();
  for (const day of scheduleData) {
    for (const lesson of day.lessons) {
      names.add(lesson.name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'uk'));
}

export const DeadlinesView: React.FC<DeadlinesViewProps> = ({
  deadlines,
  onAddDeadline,
  onToggleDeadline,
  onUpdateDeadline,
  onDeleteDeadline,
  settings,
  todayIso: todayIsoProp,
}) => {
  const { toast } = useToast();
  const todayIso = useMemo(
    () => todayIsoProp ?? formatIsoDate(new Date()),
    [todayIsoProp]
  );

  const [filter, setFilter] = useState<DeadlineFilter>('active');
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeadlineItem | null>(null);

  const subjectOptions = useMemo(() => {
    const all = getAllScheduleSubjects();
    if (!settings) return all;
    const profileSubjects = getSubjectsForSettings(settings, scheduleData);
    const rest = all.filter((name) => !profileSubjects.includes(name));
    return [...profileSubjects, ...rest];
  }, [settings]);

  const counts = useMemo(() => {
    let active = 0;
    let overdue = 0;
    let completed = 0;
    for (const item of deadlines) {
      if (item.completed) {
        completed += 1;
      } else {
        active += 1;
        if (item.dueDate < todayIso) {
          overdue += 1;
        }
      }
    }
    return { active, overdue, completed, all: deadlines.length };
  }, [deadlines, todayIso]);

  const filteredDeadlines = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return deadlines
      .filter((item) => {
        if (filter === 'active' && item.completed) return false;
        if (filter === 'completed' && !item.completed) return false;
        if (filter === 'overdue' && (item.completed || item.dueDate >= todayIso)) {
          return false;
        }
        if (!q) return true;

        const haystack = [item.title, item.subjectName ?? '', item.notes ?? '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
        if (a.priority !== b.priority) return a.priority === 'high' ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [deadlines, filter, searchQuery, todayIso]);

  const openCreateDrawer = () => {
    setEditingItem(null);
    setDrawerOpen(true);
  };

  const openEditDrawer = (item: DeadlineItem) => {
    setEditingItem(item);
    setDrawerOpen(true);
  };

  const handleConfirmDelete = (item: DeadlineItem) => {
    onDeleteDeadline(item.id);
    setConfirmDeleteId(null);
    toast.info('Дедлайн видалено', { description: item.title });
  };

  const handleToggleItem = (item: DeadlineItem) => {
    onToggleDeadline(item.id);
    toast.success(
      item.completed ? 'Повернуто в активні' : 'Завдання виконано'
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MetaChip variant="amber" mono>
              Активних: {counts.active}
            </MetaChip>
            {counts.overdue > 0 && (
              <MetaChip variant="terracotta" mono>
                Прострочених: {counts.overdue}
              </MetaChip>
            )}
          </div>
          <h2 className="mt-1.5 font-serif text-2xl font-medium tracking-[-0.015em] text-ink sm:text-[26px]">
            Дедлайни та завдання
          </h2>
          <EditorialUnderline width={96} className="mt-1.5" />
        </div>

        <button
          type="button"
          onClick={openCreateDrawer}
          className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber px-4 text-sm font-semibold text-[#242522] shadow-elevated transition-all hover:brightness-105 active:scale-[0.98]"
        >
          <Plus weight="bold" className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Додати дедлайн</span>
        </button>
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="overflow-x-auto pb-0.5">
          <SegmentedControl<DeadlineFilter>
            layoutId="deadlines-filter"
            ariaLabel="Фільтр дедлайнів"
            size="sm"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'active', label: `Активні (${counts.active})` },
              { value: 'overdue', label: `Прострочені (${counts.overdue})` },
              { value: 'completed', label: `Виконані (${counts.completed})` },
              { value: 'all', label: `Усі (${counts.all})` },
            ]}
          />
        </div>

        <div className="relative w-full lg:w-72">
          <MagnifyingGlass
            weight="regular"
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Пошук за назвою або предметом..."
            aria-label="Пошук дедлайнів"
            className="w-full rounded-xl border border-line bg-surface py-2.5 pr-8 pl-9 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Очистити пошук"
              className="absolute top-1/2 right-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-muted hover:text-ink"
            >
              <X weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Deadlines List or Empty State */}
      {filteredDeadlines.length === 0 ? (
        <GlassCard variant="matte" padding="none">
          <EmptyState
            illustration={<EmptyNotesIllustration size={80} />}
            showUnderline
            title={
              searchQuery.trim()
                ? 'Нічого не знайдено'
                : filter === 'overdue'
                  ? 'Прострочених дедлайнів немає'
                  : filter === 'completed'
                    ? 'Виконаних завдань ще немає'
                    : 'Дедлайнів поки немає'
            }
            description={
              searchQuery.trim()
                ? 'Спробуйте змінити запит пошуку або перемкнути фільтр.'
                : 'Додавайте лабораторні, практичні чи домашні завдання, щоб тримати все під контролем.'
            }
            action={
              !searchQuery.trim()
                ? {
                    label: 'Створити дедлайн',
                    onClick: openCreateDrawer,
                    icon: <Plus weight="bold" className="h-3.5 w-3.5" />,
                  }
                : undefined
            }
          />
        </GlassCard>
      ) : (
        <StaggerList itemCount={filteredDeadlines.length} className="space-y-3">
          {filteredDeadlines.map((item) => (
            <DeadlineCard
              key={item.id}
              item={item}
              todayIso={todayIso}
              isConfirmingDelete={confirmDeleteId === item.id}
              onToggle={handleToggleItem}
              onEdit={openEditDrawer}
              onRequestDelete={setConfirmDeleteId}
              onConfirmDelete={handleConfirmDelete}
              onCancelDelete={() => setConfirmDeleteId(null)}
            />
          ))}
        </StaggerList>
      )}

      <DeadlineFormModal
        open={drawerOpen}
        editingItem={editingItem}
        todayIso={todayIso}
        subjectOptions={subjectOptions}
        onClose={() => setDrawerOpen(false)}
        onAddDeadline={onAddDeadline}
        onUpdateDeadline={onUpdateDeadline}
      />
    </div>
  );
};
