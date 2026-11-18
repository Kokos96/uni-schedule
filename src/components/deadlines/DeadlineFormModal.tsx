import React, { useEffect, useState } from 'react';
import { Calendar, Clock, Fire } from '@phosphor-icons/react';
import type {
  CreateDeadlineInput,
  DeadlineItem,
  DeadlinePriority,
  UpdateDeadlinePatch,
} from '../../types/notes';
import { isValidIsoDate, isValidTimeString } from '../../utils/date';
import { normalizeExternalUrl } from '../../utils/url';
import { ModalDrawer } from '../ui/ModalDrawer';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useToast } from '../ui/Toast';

const CUSTOM_SUBJECT_VALUE = '__custom__';

export interface DeadlineFormModalProps {
  open: boolean;
  editingItem: DeadlineItem | null;
  todayIso: string;
  subjectOptions: readonly string[];
  onClose: () => void;
  onAddDeadline: (input: CreateDeadlineInput) => DeadlineItem;
  onUpdateDeadline: (id: string, patch: UpdateDeadlinePatch) => void;
}

export const DeadlineFormModal: React.FC<DeadlineFormModalProps> = ({
  open,
  editingItem,
  todayIso,
  subjectOptions,
  onClose,
  onAddDeadline,
  onUpdateDeadline,
}) => {
  const { toast } = useToast();

  const [formTitle, setFormTitle] = useState('');
  const [formSubjectOption, setFormSubjectOption] = useState('');
  const [formCustomSubject, setFormCustomSubject] = useState('');
  const [formDueDate, setFormDueDate] = useState(todayIso);
  const [formDueTime, setFormDueTime] = useState('');
  const [formPriority, setFormPriority] = useState<DeadlinePriority>('normal');
  const [formLink, setFormLink] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    if (!open) return;

    if (!editingItem) {
      setFormTitle('');
      setFormSubjectOption(subjectOptions[0] ?? CUSTOM_SUBJECT_VALUE);
      setFormCustomSubject('');
      setFormDueDate(todayIso);
      setFormDueTime('');
      setFormPriority('normal');
      setFormLink('');
      setFormNotes('');
      return;
    }

    setFormTitle(editingItem.title);
    if (!editingItem.subjectName) {
      setFormSubjectOption('');
      setFormCustomSubject('');
    } else if (subjectOptions.includes(editingItem.subjectName)) {
      setFormSubjectOption(editingItem.subjectName);
      setFormCustomSubject('');
    } else {
      setFormSubjectOption(CUSTOM_SUBJECT_VALUE);
      setFormCustomSubject(editingItem.subjectName);
    }
    setFormDueDate(editingItem.dueDate);
    setFormDueTime(editingItem.dueTime ?? '');
    setFormPriority(editingItem.priority);
    setFormLink(editingItem.link ?? '');
    setFormNotes(editingItem.notes ?? '');
  }, [open, editingItem, todayIso, subjectOptions]);

  const handleSubmit = (e: React.FormEvent) => {
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

    const payload = {
      title: trimmedTitle,
      subjectName: resolvedSubject,
      dueDate: formDueDate,
      dueTime: trimmedTime || undefined,
      priority: formPriority,
      link: normalizedLink,
      notes: formNotes.trim() || undefined,
    };

    if (editingItem) {
      onUpdateDeadline(editingItem.id, payload);
      toast.success('Дедлайн оновлено');
    } else {
      onAddDeadline(payload);
      toast.success('Дедлайн додано');
    }

    onClose();
  };

  return (
    <ModalDrawer
      open={open}
      onClose={onClose}
      title={editingItem ? 'Редагувати дедлайн' : 'Новий дедлайн'}
      description="Прив'яжіть завдання до предмета з розкладу та задайте термін здачі."
      maxWidthClassName="md:max-w-[500px]"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
            onClick={onClose}
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
  );
};
