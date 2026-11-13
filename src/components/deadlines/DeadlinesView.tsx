import React, { useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  Calendar,
  Check,
  Clock,
  Fire,
  MagnifyingGlass,
  PencilSimple,
  Plus,
  Trash,
  Warning,
  X,
} from '@phosphor-icons/react';
import type {
  CreateDeadlineInput,
  DeadlineFilter,
  DeadlineItem,
  DeadlinePriority,
  UpdateDeadlinePatch,
} from '../../types/notes';
import { cn } from '../../utils/cn';
import {
  formatIsoDate,
  formatShortDateUa,
  isValidIsoDate,
  isValidTimeString,
} from '../../utils/date';
import {
  type LessonFilterProfile,
  getSubjectsForSettings,
  scheduleData,
} from '../../utils/schedule';
import { StaggerCard, StaggerList } from '../motion/MotionPrimitives';
import { MetaChip } from '../ui/Badge';
import {
  EditorialUnderline,
  EmptyNotesIllustration,
} from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';
import { ModalDrawer } from '../ui/ModalDrawer';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useToast } from '../ui/Toast';

export interface DeadlinesViewProps {
  deadlines: DeadlineItem[];
  onAddDeadline: (input: CreateDeadlineInput) => DeadlineItem;
  onToggleDeadline: (id: string) => void;
  onUpdateDeadline: (id: string, patch: UpdateDeadlinePatch) => void;
  onDeleteDeadline: (id: string) => void;
  settings?: LessonFilterProfile;
  todayIso?: string;
}

const CUSTOM_SUBJECT_VALUE = '__custom__';

function getAllScheduleSubjects(): string[] {
  const names = new Set<string>();
  for (const day of scheduleData) {
    for (const lesson of day.lessons) {
      names.add(lesson.name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b, 'uk'));
}

function normalizeExternalUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed);
  if (hasScheme && !/^https?:/i.test(trimmed)) {
    return null;
  }

  const candidate = hasScheme ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
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

  // ModalDrawer state (create / edit)
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<DeadlineItem | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formSubjectOption, setFormSubjectOption] = useState('');
  const [formCustomSubject, setFormCustomSubject] = useState('');
  const [formDueDate, setFormDueDate] = useState(todayIso);
  const [formDueTime, setFormDueTime] = useState('');
  const [formPriority, setFormPriority] = useState<DeadlinePriority>('normal');
  const [formLink, setFormLink] = useState('');
  const [formNotes, setFormNotes] = useState('');

  const subjectOptions = useMemo(() => {
    if (settings) {
      const profileSubjects = getSubjectsForSettings(settings, scheduleData);
      const all = getAllScheduleSubjects();
      const rest = all.filter((name) => !profileSubjects.includes(name));
      return [...profileSubjects, ...rest];
    }
    return getAllScheduleSubjects();
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
    return {
      active,
      overdue,
      completed,
      all: deadlines.length,
    };
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
        const haystack = [
          item.title,
          item.subjectName ?? '',
          item.notes ?? '',
        ]
          .join(' ')
          .toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        if (a.dueDate !== b.dueDate) {
          return a.dueDate.localeCompare(b.dueDate);
        }
        if (a.priority !== b.priority) {
          return a.priority === 'high' ? -1 : 1;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [deadlines, filter, searchQuery, todayIso]);

  const openCreateDrawer = () => {
    setEditingItem(null);
    setFormTitle('');
    setFormSubjectOption(subjectOptions[0] ?? CUSTOM_SUBJECT_VALUE);
    setFormCustomSubject('');
    setFormDueDate(todayIso);
    setFormDueTime('');
    setFormPriority('normal');
    setFormLink('');
    setFormNotes('');
    setDrawerOpen(true);
  };

  const openEditDrawer = (item: DeadlineItem) => {
    setEditingItem(item);
    setFormTitle(item.title);
    if (!item.subjectName) {
      setFormSubjectOption('');
      setFormCustomSubject('');
    } else if (subjectOptions.includes(item.subjectName)) {
      setFormSubjectOption(item.subjectName);
      setFormCustomSubject('');
    } else {
      setFormSubjectOption(CUSTOM_SUBJECT_VALUE);
      setFormCustomSubject(item.subjectName);
    }
    setFormDueDate(item.dueDate);
    setFormDueTime(item.dueTime ?? '');
    setFormPriority(item.priority);
    setFormLink(item.link ?? '');
    setFormNotes(item.notes ?? '');
    setDrawerOpen(true);
  };

  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) {
      toast.warning('Вкажіть назву завдання');
      return;
    }

    if (!isValidIsoDate(formDueDate)) {
      toast.warning('Оберіть коректну дату здачі');
      return;
    }

    const trimmedTime = formDueTime.trim();
    if (trimmedTime && !isValidTimeString(trimmedTime)) {
      toast.warning('Некоректний час (формат ГГ:ХХ)');
      return;
    }

    const trimmedLink = formLink.trim();
    let normalizedLink: string | undefined;
    if (trimmedLink) {
      const safe = normalizeExternalUrl(trimmedLink);
      if (!safe) {
        toast.warning('Некоректне посилання', {
          description: 'Використовуйте URL формату https://...',
        });
        return;
      }
      normalizedLink = safe;
    }

    const resolvedSubject =
      formSubjectOption === CUSTOM_SUBJECT_VALUE
        ? formCustomSubject.trim() || undefined
        : formSubjectOption.trim() || undefined;

    if (editingItem) {
      onUpdateDeadline(editingItem.id, {
        title: trimmedTitle,
        subjectName: resolvedSubject,
        dueDate: formDueDate,
        dueTime: trimmedTime || undefined,
        priority: formPriority,
        link: normalizedLink,
        notes: formNotes.trim() || undefined,
      });
      toast.success('Дедлайн оновлено');
    } else {
      onAddDeadline({
        title: trimmedTitle,
        subjectName: resolvedSubject,
        dueDate: formDueDate,
        dueTime: trimmedTime || undefined,
        priority: formPriority,
        link: normalizedLink,
        notes: formNotes.trim() || undefined,
      });
      toast.success('Дедлайн додано');
    }

    setDrawerOpen(false);
  };

  const handleConfirmDelete = (item: DeadlineItem) => {
    onDeleteDeadline(item.id);
    setConfirmDeleteId(null);
    toast.info('Дедлайн видалено', {
      description: item.title,
    });
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
          {filteredDeadlines.map((item) => {
            const isOverdue = !item.completed && item.dueDate < todayIso;
            const isDueToday = !item.completed && item.dueDate === todayIso;
            const safeLink = item.link ? normalizeExternalUrl(item.link) : null;
            const isConfirmingDelete = confirmDeleteId === item.id;

            return (
              <StaggerCard key={item.id} interactive={false}>
                <GlassCard
                  variant={
                    item.completed
                      ? 'matte'
                      : isOverdue || item.priority === 'high'
                        ? 'glass'
                        : 'matte'
                  }
                  padding="md"
                  className={cn(
                    'transition-all duration-150',
                    item.completed && 'border-sage/30 opacity-85',
                    isOverdue && 'border-terracotta/45'
                  )}
                >
                  <div className="flex items-start gap-3">
                    {/* Sage Checkbox Toggle */}
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={item.completed}
                      aria-label={
                        item.completed
                          ? `Позначити «${item.title}» як невиконане`
                          : `Позначити «${item.title}» як виконане`
                      }
                      onClick={() => handleToggleItem(item)}
                      className={cn(
                        'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 active:scale-[0.94]',
                        item.completed
                          ? 'border-sage bg-sage text-[#242522] shadow-elevated'
                          : 'border-line-strong bg-surface-elevated/70 text-transparent hover:border-sage/60 hover:text-sage-fg/50'
                      )}
                    >
                      <Check weight="bold" className="h-4 w-4" aria-hidden="true" />
                    </button>

                    {/* Content */}
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <MetaChip
                            variant={
                              item.priority === 'high' ? 'terracotta' : 'neutral'
                            }
                            icon={
                              item.priority === 'high' ? (
                                <Fire weight="duotone" className="h-3 w-3" />
                              ) : undefined
                            }
                          >
                            {item.priority === 'high' ? 'Терміново' : 'Звичайний'}
                          </MetaChip>

                          <MetaChip
                            variant={
                              item.completed
                                ? 'sage'
                                : isOverdue
                                  ? 'terracotta'
                                  : isDueToday
                                    ? 'amber'
                                    : 'neutral'
                            }
                            mono
                            icon={
                              isOverdue ? (
                                <Warning weight="duotone" className="h-3 w-3" />
                              ) : (
                                <Calendar weight="regular" className="h-3 w-3" />
                              )
                            }
                          >
                            {isOverdue ? 'Прострочено · ' : ''}
                            {formatShortDateUa(item.dueDate)}
                            {item.dueTime ? ` · ${item.dueTime}` : ''}
                          </MetaChip>

                          {item.subjectName && (
                            <MetaChip variant="beige">
                              {item.subjectName}
                            </MetaChip>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {!isConfirmingDelete ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditDrawer(item)}
                                aria-label={`Редагувати «${item.title}»`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
                              >
                                <PencilSimple weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(item.id)}
                                aria-label={`Видалити «${item.title}»`}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-terracotta-soft hover:text-terracotta-fg"
                              >
                                <Trash weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-1 rounded-xl border border-terracotta/40 bg-terracotta-soft px-2 py-1">
                              <button
                                type="button"
                                onClick={() => handleConfirmDelete(item)}
                                className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-terracotta-fg hover:underline"
                              >
                                Видалити
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(null)}
                                className="rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary hover:text-ink"
                              >
                                Ні
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      <h3
                        className={cn(
                          'font-serif text-[17px] font-medium leading-snug',
                          item.completed
                            ? 'text-sage-fg line-through decoration-sage/60'
                            : 'text-ink'
                        )}
                      >
                        {item.title}
                      </h3>

                      {item.notes && (
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
                          {item.notes}
                        </p>
                      )}

                      {safeLink && (
                        <div className="pt-0.5">
                          <a
                            href={safeLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber-fg transition-colors hover:border-amber/55"
                          >
                            <ArrowSquareOut
                              weight="regular"
                              className="h-3 w-3 shrink-0"
                              aria-hidden="true"
                            />
                            <span>Матеріали</span>
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </StaggerCard>
            );
          })}
        </StaggerList>
      )}

      {/* Create / Edit ModalDrawer */}
      <ModalDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editingItem ? 'Редагувати дедлайн' : 'Новий дедлайн'}
        description="Прив'яжіть завдання до предмета з розкладу та задайте термін здачі."
        maxWidthClassName="md:max-w-[500px]"
      >
        <form onSubmit={handleSubmitForm} className="space-y-4">
          <div>
            <label
              htmlFor="deadline-title"
              className="mb-1 block text-xs font-medium text-ink-secondary"
            >
              Назва завдання *
            </label>
            <input
              id="deadline-title"
              type="text"
              required
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Напр., Здати лабораторну роботу №4"
              className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="deadline-subject"
              className="mb-1 block text-xs font-medium text-ink-secondary"
            >
              Дисципліна з розкладу
            </label>
            <select
              id="deadline-subject"
              value={formSubjectOption}
              onChange={(e) => setFormSubjectOption(e.target.value)}
              className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2.5 text-sm text-ink focus:border-amber focus:outline-none"
            >
              <option value="">Без прив'язки до предмета</option>
              {subjectOptions.map((subject) => (
                <option key={subject} value={subject}>
                  {subject}
                </option>
              ))}
              <option value={CUSTOM_SUBJECT_VALUE}>Інший предмет…</option>
            </select>

            {formSubjectOption === CUSTOM_SUBJECT_VALUE && (
              <input
                type="text"
                value={formCustomSubject}
                onChange={(e) => setFormCustomSubject(e.target.value)}
                placeholder="Введіть назву предмета"
                aria-label="Власна назва предмета"
                className="mt-2 w-full rounded-xl border border-line bg-canvas/70 px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
              />
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="deadline-date"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-secondary"
              >
                <Calendar weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Дата здачі *</span>
              </label>
              <input
                id="deadline-date"
                type="date"
                required
                value={formDueDate}
                onChange={(e) => setFormDueDate(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="deadline-time"
                className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-secondary"
              >
                <Clock weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Час (необов'язково)</span>
              </label>
              <input
                id="deadline-time"
                type="time"
                value={formDueTime}
                onChange={(e) => setFormDueTime(e.target.value)}
                className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2.5 font-mono text-xs text-ink focus:border-amber focus:outline-none"
              />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
              Пріоритет
            </span>
            <SegmentedControl<DeadlinePriority>
              layoutId="deadline-form-priority"
              ariaLabel="Пріоритет завдання"
              fullWidth
              size="sm"
              value={formPriority}
              onChange={setFormPriority}
              options={[
                { value: 'normal', label: 'Звичайний' },
                {
                  value: 'high',
                  label: 'Терміново',
                  icon: <Fire weight="duotone" className="h-3.5 w-3.5" />,
                },
              ]}
            />
          </div>

          <div>
            <label
              htmlFor="deadline-link"
              className="mb-1 block text-xs font-medium text-ink-secondary"
            >
              Посилання (необов'язково)
            </label>
            <input
              id="deadline-link"
              type="text"
              inputMode="url"
              value={formLink}
              onChange={(e) => setFormLink(e.target.value)}
              placeholder="https://classroom.google.com/..."
              className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2.5 text-xs text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="deadline-notes"
              className="mb-1 block text-xs font-medium text-ink-secondary"
            >
              Нотатки (необов'язково)
            </label>
            <textarea
              id="deadline-notes"
              rows={3}
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Деталі виконання, номер варіанта..."
              className="w-full resize-y rounded-xl border border-line bg-canvas/70 px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line/70 pt-3">
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-line bg-surface-elevated px-4 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
            >
              Скасувати
            </button>
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-4 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98]"
            >
              <span>{editingItem ? 'Зберегти зміни' : 'Створити'}</span>
            </button>
          </div>
        </form>
      </ModalDrawer>
    </div>
  );
};
