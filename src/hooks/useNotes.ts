import { useCallback, useEffect, useState } from 'react';
import { LessonNote, SaveNoteInput } from '../types/notes';
import { mergeByIdWithTimestamp } from '../utils/backup';
import { isValidIsoDate } from '../utils/date';
import { generateId, readStorage, StorageErrorCode, writeStorage } from '../utils/storage';

const NOTES_KEY = 'uni_schedule_notes_v1';

function sanitizeNotes(raw: unknown): LessonNote[] {
  if (!Array.isArray(raw)) return [];
  const valid: LessonNote[] = [];
  const seenIds = new Set<string>();

  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as Partial<LessonNote>;
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.trim().length === 0 ||
      typeof candidate.lessonId !== 'string' ||
      candidate.lessonId.trim().length === 0 ||
      typeof candidate.content !== 'string' ||
      typeof candidate.updatedAt !== 'string'
    ) {
      continue;
    }

    if (seenIds.has(candidate.id)) continue;
    seenIds.add(candidate.id);

    const date =
      typeof candidate.date === 'string' && isValidIsoDate(candidate.date)
        ? candidate.date
        : undefined;
    const link =
      typeof candidate.link === 'string' && candidate.link.trim().length > 0
        ? candidate.link.trim()
        : undefined;
    const deadlineDate =
      typeof candidate.deadlineDate === 'string' && isValidIsoDate(candidate.deadlineDate)
        ? candidate.deadlineDate
        : undefined;

    valid.push({
      id: candidate.id,
      lessonId: candidate.lessonId.trim(),
      ...(date ? { date } : {}),
      content: candidate.content,
      ...(link ? { link } : {}),
      ...(deadlineDate ? { deadlineDate } : {}),
      updatedAt: candidate.updatedAt,
    });
  }

  return valid;
}

export interface UseNotesResult {
  notes: LessonNote[];
  saveNote: (input: SaveNoteInput) => LessonNote;
  deleteNote: (id: string) => void;
  getNotesForLesson: (lessonId: string, date?: string) => LessonNote[];
  replaceNotes: (nextNotes: readonly LessonNote[]) => void;
  mergeNotes: (incomingNotes: readonly LessonNote[]) => void;
  clearNotes: () => void;
  storageError: StorageErrorCode | null;
}

export const useNotes = (): UseNotesResult => {
  const [notes, setNotes] = useState<LessonNote[]>(() => {
    const saved = readStorage<unknown>(NOTES_KEY, []);
    return sanitizeNotes(saved);
  });
  const [storageError, setStorageError] = useState<StorageErrorCode | null>(null);

  useEffect(() => {
    const result = writeStorage(NOTES_KEY, notes);
    setStorageError(result.ok ? null : (result.error ?? 'unknown'));
  }, [notes]);

  const saveNote = useCallback((input: SaveNoteInput): LessonNote => {
    const nowIso = new Date().toISOString();
    const trimmedLink = input.link?.trim();
    const validDate = input.date && isValidIsoDate(input.date) ? input.date : undefined;
    const validDeadline =
      input.deadlineDate && isValidIsoDate(input.deadlineDate)
        ? input.deadlineDate
        : undefined;

    const note: LessonNote = {
      id: input.id && input.id.trim().length > 0 ? input.id : generateId(),
      lessonId: input.lessonId,
      ...(validDate ? { date: validDate } : {}),
      content: input.content,
      ...(trimmedLink ? { link: trimmedLink } : {}),
      ...(validDeadline ? { deadlineDate: validDeadline } : {}),
      updatedAt: nowIso,
    };

    setNotes((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === note.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex] = note;
        return updated;
      }
      return [note, ...prev];
    });

    return note;
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const getNotesForLesson = useCallback(
    (lessonId: string, date?: string): LessonNote[] => {
      return notes
        .filter((note) => {
          if (note.lessonId !== lessonId) return false;
          if (!date) return true;
          return note.date === date || note.date === undefined;
        })
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },
    [notes]
  );

  const replaceNotes = useCallback((nextNotes: readonly LessonNote[]) => {
    setNotes(sanitizeNotes(nextNotes));
  }, []);

  const mergeNotes = useCallback((incomingNotes: readonly LessonNote[]) => {
    const cleanIncoming = sanitizeNotes(incomingNotes);
    setNotes((prev) =>
      mergeByIdWithTimestamp(prev, cleanIncoming, (note) => note.updatedAt)
    );
  }, []);

  const clearNotes = useCallback(() => {
    setNotes([]);
  }, []);

  return {
    notes,
    saveNote,
    deleteNote,
    getNotesForLesson,
    replaceNotes,
    mergeNotes,
    clearNotes,
    storageError,
  };
};
