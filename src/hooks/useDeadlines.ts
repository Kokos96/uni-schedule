import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CreateDeadlineInput,
  DeadlineItem,
  DeadlinePriority,
  UpdateDeadlinePatch,
} from '../types/notes';
import { mergeByIdWithTimestamp } from '../utils/backup';
import { formatIsoDate, isValidIsoDate, isValidTimeString } from '../utils/date';
import { generateId, readStorage, StorageErrorCode, writeStorage } from '../utils/storage';

const DEADLINES_KEY = 'uni_schedule_deadlines_v1';
const VALID_PRIORITIES = new Set<DeadlinePriority>(['normal', 'high']);

function sanitizeDeadlines(raw: unknown): DeadlineItem[] {
  if (!Array.isArray(raw)) return [];
  const valid: DeadlineItem[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as Partial<DeadlineItem>;
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof candidate.title !== 'string' ||
      candidate.title.trim().length === 0 ||
      typeof candidate.dueDate !== 'string' ||
      !isValidIsoDate(candidate.dueDate) ||
      typeof candidate.priority !== 'string' ||
      !VALID_PRIORITIES.has(candidate.priority as DeadlinePriority) ||
      typeof candidate.completed !== 'boolean' ||
      typeof candidate.createdAt !== 'string'
    ) {
      continue;
    }

    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);

    const subjectName = candidate.subjectName?.trim() || undefined;
    const lessonId = candidate.lessonId?.trim() || undefined;
    const dueTime =
      candidate.dueTime && isValidTimeString(candidate.dueTime)
        ? candidate.dueTime.trim()
        : undefined;
    const notes = candidate.notes?.trim() || undefined;
    const link = candidate.link?.trim() || undefined;

    valid.push({
      id: candidate.id,
      title: candidate.title.trim(),
      ...(subjectName ? { subjectName } : {}),
      ...(lessonId ? { lessonId } : {}),
      dueDate: candidate.dueDate,
      ...(dueTime ? { dueTime } : {}),
      priority: candidate.priority as DeadlinePriority,
      completed: candidate.completed,
      ...(notes ? { notes } : {}),
      ...(link ? { link } : {}),
      createdAt: candidate.createdAt,
      ...(typeof candidate.updatedAt === 'string'
        ? { updatedAt: candidate.updatedAt }
        : {}),
    });
  }

  return valid;
}

export interface UseDeadlinesResult {
  deadlines: DeadlineItem[];
  activeCount: number;
  overdueCount: number;
  addDeadline: (input: CreateDeadlineInput) => DeadlineItem;
  toggleDeadline: (id: string) => void;
  updateDeadline: (id: string, patch: UpdateDeadlinePatch) => void;
  deleteDeadline: (id: string) => void;
  replaceDeadlines: (nextDeadlines: readonly DeadlineItem[]) => void;
  mergeDeadlines: (incomingDeadlines: readonly DeadlineItem[]) => void;
  clearDeadlines: () => void;
  storageError: StorageErrorCode | null;
}

export const useDeadlines = (): UseDeadlinesResult => {
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>(() => {
    const saved = readStorage<unknown>(DEADLINES_KEY, []);
    return sanitizeDeadlines(saved);
  });
  const [storageError, setStorageError] = useState<StorageErrorCode | null>(null);

  useEffect(() => {
    const result = writeStorage(DEADLINES_KEY, deadlines);
    setStorageError(result.ok ? null : (result.error ?? 'unknown'));
  }, [deadlines]);

  const addDeadline = useCallback((input: CreateDeadlineInput): DeadlineItem => {
    const nowIso = new Date().toISOString();
    const subjectName = input.subjectName?.trim() || undefined;
    const lessonId = input.lessonId?.trim() || undefined;
    const dueTime =
      input.dueTime && isValidTimeString(input.dueTime)
        ? input.dueTime.trim()
        : undefined;
    const notes = input.notes?.trim() || undefined;
    const link = input.link?.trim() || undefined;

    const item: DeadlineItem = {
      id: generateId(),
      title: input.title.trim(),
      ...(subjectName ? { subjectName } : {}),
      ...(lessonId ? { lessonId } : {}),
      dueDate: input.dueDate,
      ...(dueTime ? { dueTime } : {}),
      priority: input.priority ?? 'normal',
      completed: input.completed ?? false,
      ...(notes ? { notes } : {}),
      ...(link ? { link } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setDeadlines((prev) => [item, ...prev]);
    return item;
  }, []);

  const toggleDeadline = useCallback((id: string) => {
    const nowIso = new Date().toISOString();
    setDeadlines((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, completed: !item.completed, updatedAt: nowIso }
          : item
      )
    );
  }, []);

  const updateDeadline = useCallback((id: string, patch: UpdateDeadlinePatch) => {
    const nowIso = new Date().toISOString();
    setDeadlines((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next: DeadlineItem = {
          ...item,
          ...patch,
          id: item.id,
          createdAt: item.createdAt,
          updatedAt: nowIso,
        };
        return next;
      })
    );
  }, []);

  const deleteDeadline = useCallback((id: string) => {
    setDeadlines((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const replaceDeadlines = useCallback((nextDeadlines: readonly DeadlineItem[]) => {
    setDeadlines(sanitizeDeadlines(nextDeadlines));
  }, []);

  const mergeDeadlines = useCallback((incomingDeadlines: readonly DeadlineItem[]) => {
    const cleanIncoming = sanitizeDeadlines(incomingDeadlines);
    setDeadlines((prev) =>
      mergeByIdWithTimestamp(
        prev,
        cleanIncoming,
        (deadline) => deadline.updatedAt ?? deadline.createdAt
      )
    );
  }, []);

  const clearDeadlines = useCallback(() => {
    setDeadlines([]);
  }, []);

  const { activeCount, overdueCount } = useMemo(() => {
    const todayIso = formatIsoDate(new Date());
    let active = 0;
    let overdue = 0;
    for (const item of deadlines) {
      if (!item.completed) {
        active += 1;
        if (item.dueDate < todayIso) {
          overdue += 1;
        }
      }
    }
    return { activeCount: active, overdueCount: overdue };
  }, [deadlines]);

  return {
    deadlines,
    activeCount,
    overdueCount,
    addDeadline,
    toggleDeadline,
    updateDeadline,
    deleteDeadline,
    replaceDeadlines,
    mergeDeadlines,
    clearDeadlines,
    storageError,
  };
};
