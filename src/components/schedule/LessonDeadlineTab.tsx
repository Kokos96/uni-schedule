import React, { useEffect, useState } from 'react';
import { CalendarPlus } from '@phosphor-icons/react';
import type { Lesson } from '../../types';
import type {
  CreateDeadlineInput,
  DeadlineItem,
  DeadlinePriority,
} from '../../types/notes';
import {
  formatShortDateUa,
  isValidIsoDate,
  isValidTimeString,
} from '../../utils/date';
import { normalizeExternalUrl } from '../../utils/url';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useToast } from '../ui/Toast';

export interface LessonDeadlineTabProps {
  lesson: Lesson;
  dateIso: string;
  onCreateDeadline: (input: CreateDeadlineInput) => DeadlineItem;
  onCreated: () => void;
}

export const LessonDeadlineTab: React.FC<LessonDeadlineTabProps> = ({
  lesson,
  dateIso,
  onCreateDeadline,
  onCreated,
}) => {
  const { toast } = useToast();

  const [deadlineTitle, setDeadlineTitle] = useState(`Завдання: ${lesson.name}`);
  const [deadlineDueDate, setDeadlineDueDate] = useState(dateIso);
  const [deadlineDueTime, setDeadlineDueTime] = useState('');
  const [deadlinePriority, setDeadlinePriority] =
    useState<DeadlinePriority>('normal');
  const [deadlineLink, setDeadlineLink] = useState('');
  const [deadlineNotes, setDeadlineNotes] = useState('');

  useEffect(() => {
    setDeadlineTitle(`Завдання: ${lesson.name}`);
    setDeadlineDueDate(dateIso);
    setDeadlineDueTime('');
    setDeadlinePriority('normal');
    setDeadlineLink('');
    setDeadlineNotes('');
  }, [lesson.id, lesson.name, dateIso]);

  const handleCreateDeadlineSubmit = (e: React.FormEvent) => {
    e.preventDefault();

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
    onCreated();
  };

  return (
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
  );
};
