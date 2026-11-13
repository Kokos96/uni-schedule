import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowSquareOut,
  Calendar,
  CalendarPlus,
  LinkSimple,
  Note,
  PencilSimple,
  Plus,
  Trash,
} from '@phosphor-icons/react';
import type { Classroom, Lesson, Teacher } from '../../types';
import type {
  CreateDeadlineInput,
  DeadlineItem,
  DeadlinePriority,
  LessonNote,
  SaveNoteInput,
} from '../../types/notes';
import { cn } from '../../utils/cn';
import { formatShortDateUa, isValidIsoDate, isValidTimeString } from '../../utils/date';
import { LessonTypeBadge, MetaChip } from '../ui/Badge';
import { EmptyNotesIllustration } from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { ModalDrawer } from '../ui/ModalDrawer';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useToast } from '../ui/Toast';

export interface LessonNotesDrawerProps {
  open: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  dateIso: string;
  notes: LessonNote[];
  onSaveNote: (input: SaveNoteInput) => LessonNote;
  onDeleteNote: (id: string) => void;
  onCreateDeadline?: (input: CreateDeadlineInput) => DeadlineItem | void;
  teacher?: Teacher;
  classroom?: Classroom;
}

type DrawerTab = 'notes' | 'deadline';
type NoteScope = 'date' | 'general';

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

function getFriendlyLinkLabel(urlString: string): string {
  try {
    const host = new URL(urlString).hostname.replace(/^www\./, '');
    if (host.includes('zoom.us')) return 'Zoom';
    if (host.includes('meet.google.com')) return 'Google Meet';
    if (host.includes('t.me') || host.includes('telegram')) return 'Telegram';
    if (host.includes('docs.google.com')) return 'Google Docs';
    if (host.includes('drive.google.com')) return 'Google Drive';
    if (host.includes('classroom.google.com')) return 'Classroom';
    if (host.includes('github.com')) return 'GitHub';
    return host;
  } catch {
    return 'Посилання';
  }
}

export const LessonNotesDrawer: React.FC<LessonNotesDrawerProps> = ({
  open,
  onClose,
  lesson,
  dateIso,
  notes,
  onSaveNote,
  onDeleteNote,
  onCreateDeadline,
  teacher,
  classroom,
}) => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<DrawerTab>('notes');

  // Note form state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteScope, setNoteScope] = useState<NoteScope>('date');
  const [content, setContent] = useState('');
  const [linkInput, setLinkInput] = useState('');
  const [noteDeadlineDate, setNoteDeadlineDate] = useState('');
  const [alsoCreateDeadline, setAlsoCreateDeadline] = useState(false);

  // Direct deadline form state
  const [deadlineTitle, setDeadlineTitle] = useState('');
  const [deadlineDueDate, setDeadlineDueDate] = useState(dateIso);
  const [deadlineDueTime, setDeadlineDueTime] = useState('');
  const [deadlinePriority, setDeadlinePriority] =
    useState<DeadlinePriority>('normal');
  const [deadlineLink, setDeadlineLink] = useState('');
  const [deadlineNotes, setDeadlineNotes] = useState('');

  // Reset form when opening for a new lesson/date
  useEffect(() => {
    if (!open) return;
    setActiveTab('notes');
    setEditingNoteId(null);
    setNoteScope('date');
    setContent('');
    setLinkInput('');
    setNoteDeadlineDate('');
    setAlsoCreateDeadline(false);

    setDeadlineTitle(lesson ? `Завдання: ${lesson.name}` : '');
    setDeadlineDueDate(dateIso);
    setDeadlineDueTime('');
    setDeadlinePriority('normal');
    setDeadlineLink('');
    setDeadlineNotes('');
  }, [open, lesson?.id, dateIso, lesson]);

  const lessonNotes = useMemo(() => {
    if (!lesson) return [];
    return notes
      .filter(
        (n) =>
          n.lessonId === lesson.id &&
          (n.date === undefined || n.date === dateIso)
      )
      .sort((a, b) => {
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, lesson, dateIso]);

  const previewSafeLink = useMemo(
    () => normalizeExternalUrl(linkInput),
    [linkInput]
  );

  const startEditingNote = (note: LessonNote) => {
    setActiveTab('notes');
    setEditingNoteId(note.id);
    setNoteScope(note.date ? 'date' : 'general');
    setContent(note.content);
    setLinkInput(note.link ?? '');
    setNoteDeadlineDate(note.deadlineDate ?? '');
    setAlsoCreateDeadline(false);
  };

  const resetNoteForm = () => {
    setEditingNoteId(null);
    setNoteScope('date');
    setContent('');
    setLinkInput('');
    setNoteDeadlineDate('');
    setAlsoCreateDeadline(false);
  };

  const handleSaveNoteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson) return;

    const trimmedContent = content.trim();
    if (!trimmedContent) {
      toast.warning('Введіть текст нотатки');
      return;
    }

    const trimmedLink = linkInput.trim();
    let normalizedLink: string | undefined;
    if (trimmedLink) {
      const safeUrl = normalizeExternalUrl(trimmedLink);
      if (!safeUrl) {
        toast.warning('Некоректне посилання', {
          description: 'Використовуйте URL формату https://...',
        });
        return;
      }
      normalizedLink = safeUrl;
    }

    const validDeadlineDate =
      noteDeadlineDate && isValidIsoDate(noteDeadlineDate)
        ? noteDeadlineDate
        : undefined;

    if (alsoCreateDeadline && !validDeadlineDate) {
      toast.warning('Оберіть дату для дедлайну');
      return;
    }

    const isEditing = Boolean(editingNoteId);

    onSaveNote({
      ...(editingNoteId ? { id: editingNoteId } : {}),
      lessonId: lesson.id,
      date: noteScope === 'date' ? dateIso : undefined,
      content: trimmedContent,
      link: normalizedLink,
      deadlineDate: validDeadlineDate,
    });

    if (alsoCreateDeadline && validDeadlineDate && onCreateDeadline) {
      const firstLine = trimmedContent.split('\n')[0]?.trim().slice(0, 72);
      onCreateDeadline({
        title: firstLine || `Завдання: ${lesson.name}`,
        subjectName: lesson.name,
        lessonId: lesson.id,
        dueDate: validDeadlineDate,
        priority: 'normal',
        notes: trimmedContent,
        link: normalizedLink,
      });
      toast.success(
        isEditing ? 'Нотатку оновлено та дедлайн додано' : 'Нотатку та дедлайн збережено'
      );
    } else {
      toast.success(isEditing ? 'Нотатку оновлено' : 'Нотатку збережено');
    }

    resetNoteForm();
  };

  const handleDeleteNote = (noteId: string) => {
    onDeleteNote(noteId);
    if (editingNoteId === noteId) {
      resetNoteForm();
    }
    toast.info('Нотатку видалено');
  };

  const handleCreateDeadlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lesson || !onCreateDeadline) return;

    const trimmedTitle = deadlineTitle.trim();
    if (!trimmedTitle) {
      toast.warning('Вкажіть назву дедлайну');
      return;
    }

    if (!isValidIsoDate(deadlineDueDate)) {
      toast.warning('Оберіть коректну дату здачі');
      return;
    }

    const trimmedTime = deadlineDueTime.trim();
    if (trimmedTime && !isValidTimeString(trimmedTime)) {
      toast.warning('Некоректний час (формат ГГ:ХХ)');
      return;
    }

    const trimmedLink = deadlineLink.trim();
    let normalizedLink: string | undefined;
    if (trimmedLink) {
      const safeUrl = normalizeExternalUrl(trimmedLink);
      if (!safeUrl) {
        toast.warning('Некоректне посилання', {
          description: 'Використовуйте URL формату https://...',
        });
        return;
      }
      normalizedLink = safeUrl;
    }

    onCreateDeadline({
      title: trimmedTitle,
      subjectName: lesson.name,
      lessonId: lesson.id,
      dueDate: deadlineDueDate,
      dueTime: trimmedTime || undefined,
      priority: deadlinePriority,
      notes: deadlineNotes.trim() || undefined,
      link: normalizedLink,
    });

    toast.success('Дедлайн додано', {
      description: `${trimmedTitle} · до ${formatShortDateUa(deadlineDueDate)}`,
    });

    setDeadlineTitle(`Завдання: ${lesson.name}`);
    setDeadlineDueTime('');
    setDeadlinePriority('normal');
    setDeadlineLink('');
    setDeadlineNotes('');
    setActiveTab('notes');
  };

  const drawerTitle = lesson ? (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetaChip variant="amber" mono>
          {lesson.startTime}–{lesson.endTime}
        </MetaChip>
        <LessonTypeBadge type={lesson.type} compact />
        <MetaChip variant="neutral" mono>
          {formatShortDateUa(dateIso)}
        </MetaChip>
      </div>
      <div className="font-serif text-lg font-medium leading-snug text-ink">
        {lesson.name}
      </div>
    </div>
  ) : (
    'Нотатки'
  );

  const drawerDescription = [
    classroom ? `Ауд. ${classroom.code} (${classroom.building})` : null,
    teacher?.fullName ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ModalDrawer
      open={open && lesson !== null}
      onClose={onClose}
      title={drawerTitle}
      description={drawerDescription || undefined}
      maxWidthClassName="md:max-w-[540px]"
    >
      {lesson && (
        <div className="space-y-5">
          {/* Switch between Notes and Quick Linked Deadline */}
          {onCreateDeadline && (
            <SegmentedControl<DrawerTab>
              layoutId="lesson-drawer-tab"
              ariaLabel="Розділ картки пари"
              fullWidth
              size="sm"
              value={activeTab}
              onChange={setActiveTab}
              options={[
                {
                  value: 'notes',
                  label: `Нотатки (${lessonNotes.length})`,
                  icon: <Note className="h-3.5 w-3.5" weight="regular" />,
                },
                {
                  value: 'deadline',
                  label: 'Створити дедлайн',
                  icon: <CalendarPlus className="h-3.5 w-3.5" weight="regular" />,
                },
              ]}
            />
          )}

          {activeTab === 'notes' ? (
            <>
              {/* Add / Edit Note Form */}
              <form
                onSubmit={handleSaveNoteSubmit}
                className="space-y-3 rounded-2xl border border-line bg-surface/80 p-3.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">
                    {editingNoteId ? 'Редагування нотатки' : 'Нова нотатка'}
                  </span>

                  <SegmentedControl<NoteScope>
                    layoutId="note-scope-switch"
                    ariaLabel="Прив'язка нотатки"
                    size="sm"
                    value={noteScope}
                    onChange={setNoteScope}
                    options={[
                      {
                        value: 'date',
                        label: `На ${formatShortDateUa(dateIso)}`,
                      },
                      { value: 'general', label: 'Загальна' },
                    ]}
                  />
                </div>

                <div>
                  <label htmlFor="lesson-note-content" className="sr-only">
                    Текст нотатки
                  </label>
                  <textarea
                    id="lesson-note-content"
                    rows={3}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Конспект, тема пари, домашнє завдання або важливі зауваження..."
                    className="w-full resize-y rounded-xl border border-line bg-canvas/70 px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="lesson-note-link"
                      className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary"
                    >
                      <LinkSimple className="h-3 w-3" weight="regular" aria-hidden="true" />
                      <span>Посилання (Zoom / Meet / Docs)</span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        id="lesson-note-link"
                        type="text"
                        inputMode="url"
                        value={linkInput}
                        onChange={(e) => setLinkInput(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        className="min-w-0 flex-1 rounded-xl border border-line bg-canvas/70 px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
                      />
                      {previewSafeLink && (
                        <a
                          href={previewSafeLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Відкрити посилання"
                          aria-label="Відкрити посилання у новій вкладці"
                          className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl border border-amber/35 bg-amber-soft text-amber-fg transition-colors hover:border-amber/60"
                        >
                          <ArrowSquareOut className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="lesson-note-deadline-date"
                      className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-ink-secondary"
                    >
                      <Calendar className="h-3 w-3" weight="regular" aria-hidden="true" />
                      <span>Дедлайн (необов'язково)</span>
                    </label>
                    <input
                      id="lesson-note-deadline-date"
                      type="date"
                      value={noteDeadlineDate}
                      onChange={(e) => {
                        setNoteDeadlineDate(e.target.value);
                        if (!e.target.value) setAlsoCreateDeadline(false);
                      }}
                      className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                    />
                  </div>
                </div>

                {onCreateDeadline && noteDeadlineDate && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber/25 bg-amber-soft/60 px-3 py-2 text-xs text-ink">
                    <input
                      type="checkbox"
                      checked={alsoCreateDeadline}
                      onChange={(e) => setAlsoCreateDeadline(e.target.checked)}
                      className="h-4 w-4 rounded accent-[#D88B45]"
                    />
                    <span>Також додати запис у вкладку «Дедлайни»</span>
                  </label>
                )}

                <div className="flex items-center justify-end gap-2 pt-1">
                  {editingNoteId && (
                    <button
                      type="button"
                      onClick={resetNoteForm}
                      className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated px-3 text-xs font-medium text-ink-secondary transition-colors hover:text-ink"
                    >
                      Скасувати
                    </button>
                  )}
                  <button
                    type="submit"
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-4 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98]"
                  >
                    <Plus className="h-3.5 w-3.5" weight="bold" aria-hidden="true" />
                    <span>
                      {editingNoteId ? 'Зберегти зміни' : 'Зберегти нотатку'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Saved Notes List */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                  Збережені нотатки ({lessonNotes.length})
                </h3>

                {lessonNotes.length === 0 ? (
                  <EmptyState
                    compact
                    illustration={<EmptyNotesIllustration size={64} />}
                    title="Нотаток ще немає"
                    description="Додайте посилання на пару, конспект або термін здачі завдання."
                  />
                ) : (
                  <div className="space-y-2.5">
                    {lessonNotes.map((note) => {
                      const safeLink = note.link
                        ? normalizeExternalUrl(note.link)
                        : null;
                      const isEditing = editingNoteId === note.id;

                      return (
                        <div
                          key={note.id}
                          className={cn(
                            'rounded-2xl border p-3.5 transition-colors',
                            isEditing
                              ? 'border-amber/50 bg-amber-soft/30'
                              : 'border-line bg-surface/75'
                          )}
                        >
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <MetaChip
                                variant={note.date ? 'amber' : 'beige'}
                                mono={Boolean(note.date)}
                              >
                                {note.date
                                  ? `На ${formatShortDateUa(note.date)}`
                                  : 'Загальна для пари'}
                              </MetaChip>
                              {note.deadlineDate && (
                                <MetaChip variant="terracotta" mono>
                                  До {formatShortDateUa(note.deadlineDate)}
                                </MetaChip>
                              )}
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => startEditingNote(note)}
                                aria-label="Редагувати нотатку"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
                              >
                                <PencilSimple className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteNote(note.id)}
                                aria-label="Видалити нотатку"
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-terracotta-soft hover:text-terracotta-fg"
                              >
                                <Trash className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
                              </button>
                            </div>
                          </div>

                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                            {note.content}
                          </p>

                          {safeLink && (
                            <div className="mt-2.5">
                              <a
                                href={safeLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-xl border border-amber/30 bg-amber-soft px-3 py-1.5 text-xs font-medium text-amber-fg transition-colors hover:border-amber/55 hover:bg-amber/20"
                              >
                                <ArrowSquareOut
                                  className="h-3.5 w-3.5 shrink-0"
                                  weight="regular"
                                  aria-hidden="true"
                                />
                                <span>{getFriendlyLinkLabel(safeLink)}</span>
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Direct Linked Deadline Creation */
            <form
              onSubmit={handleCreateDeadlineSubmit}
              className="space-y-3.5 rounded-2xl border border-line bg-surface/80 p-4"
            >
              <div>
                <label
                  htmlFor="linked-deadline-title"
                  className="mb-1 block text-xs font-medium text-ink-secondary"
                >
                  Назва завдання
                </label>
                <input
                  id="linked-deadline-title"
                  type="text"
                  required
                  value={deadlineTitle}
                  onChange={(e) => setDeadlineTitle(e.target.value)}
                  placeholder="Напр., Лабораторна робота №3"
                  className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="linked-deadline-date"
                    className="mb-1 block text-xs font-medium text-ink-secondary"
                  >
                    Дата здачі
                  </label>
                  <input
                    id="linked-deadline-date"
                    type="date"
                    required
                    value={deadlineDueDate}
                    onChange={(e) => setDeadlineDueDate(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                  />
                </div>
                <div>
                  <label
                    htmlFor="linked-deadline-time"
                    className="mb-1 block text-xs font-medium text-ink-secondary"
                  >
                    Час (необов'язково)
                  </label>
                  <input
                    id="linked-deadline-time"
                    type="time"
                    value={deadlineDueTime}
                    onChange={(e) => setDeadlineDueTime(e.target.value)}
                    className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2 font-mono text-xs text-ink focus:border-amber focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <span className="mb-1.5 block text-xs font-medium text-ink-secondary">
                  Пріоритет
                </span>
                <SegmentedControl<DeadlinePriority>
                  layoutId="linked-deadline-priority"
                  ariaLabel="Пріоритет дедлайну"
                  fullWidth
                  size="sm"
                  value={deadlinePriority}
                  onChange={setDeadlinePriority}
                  options={[
                    { value: 'normal', label: 'Звичайний' },
                    { value: 'high', label: 'Терміново' },
                  ]}
                />
              </div>

              <div>
                <label
                  htmlFor="linked-deadline-link"
                  className="mb-1 block text-xs font-medium text-ink-secondary"
                >
                  Посилання на матеріали (необов'язково)
                </label>
                <input
                  id="linked-deadline-link"
                  type="text"
                  inputMode="url"
                  value={deadlineLink}
                  onChange={(e) => setDeadlineLink(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-line bg-canvas/70 px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="linked-deadline-notes"
                  className="mb-1 block text-xs font-medium text-ink-secondary"
                >
                  Деталі (необов'язково)
                </label>
                <textarea
                  id="linked-deadline-notes"
                  rows={2}
                  value={deadlineNotes}
                  onChange={(e) => setDeadlineNotes(e.target.value)}
                  placeholder="Вимоги до оформлення, варіант тощо..."
                  className="w-full resize-y rounded-xl border border-line bg-canvas/70 px-3 py-2 text-xs text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
                />
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="submit"
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-4 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98]"
                >
                  <CalendarPlus className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
                  <span>Додати дедлайн</span>
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </ModalDrawer>
  );
};
