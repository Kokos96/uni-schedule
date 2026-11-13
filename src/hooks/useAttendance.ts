import { useCallback, useEffect, useState } from 'react';
import { AttendanceRecord, AttendanceStatus } from '../types';
import { deduplicateAttendanceRecords } from '../utils/backup';
import { isValidIsoDate } from '../utils/date';
import { readStorage, StorageErrorCode, writeStorage } from '../utils/storage';

const STORAGE_KEY = 'uni_schedule_attendance_v1';

const VALID_STATUSES = new Set<AttendanceStatus>(['present', 'absent', 'excused']);

function sanitizeRecords(raw: unknown): AttendanceRecord[] {
  if (!Array.isArray(raw)) return [];
  const valid: AttendanceRecord[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as Partial<AttendanceRecord>;
    if (
      typeof candidate.lessonId === 'string' &&
      candidate.lessonId.trim().length > 0 &&
      typeof candidate.date === 'string' &&
      isValidIsoDate(candidate.date) &&
      typeof candidate.status === 'string' &&
      VALID_STATUSES.has(candidate.status as AttendanceStatus)
    ) {
      valid.push({
        lessonId: candidate.lessonId.trim(),
        date: candidate.date,
        status: candidate.status as AttendanceStatus,
      });
    }
  }
  return deduplicateAttendanceRecords(valid);
}

export interface UseAttendanceResult {
  records: AttendanceRecord[];
  toggleAttendance: (lessonId: string, date: string, status: AttendanceStatus) => void;
  setAttendance: (lessonId: string, date: string, status: AttendanceStatus | null) => void;
  getStatus: (lessonId: string, date: string) => AttendanceStatus | null;
  replaceRecords: (nextRecords: readonly AttendanceRecord[]) => void;
  mergeRecords: (incomingRecords: readonly AttendanceRecord[]) => void;
  clearRecords: () => void;
  storageError: StorageErrorCode | null;
}

export const useAttendance = (): UseAttendanceResult => {
  const [records, setRecords] = useState<AttendanceRecord[]>(() => {
    const raw = readStorage<unknown>(STORAGE_KEY, []);
    return sanitizeRecords(raw);
  });
  const [storageError, setStorageError] = useState<StorageErrorCode | null>(null);

  useEffect(() => {
    const result = writeStorage(STORAGE_KEY, records);
    setStorageError(result.ok ? null : (result.error ?? 'unknown'));
  }, [records]);

  const toggleAttendance = useCallback(
    (lessonId: string, date: string, status: AttendanceStatus) => {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(15);
        } catch {
          // Ignore vibration restrictions on unsupported browsers
        }
      }

      setRecords((prev) => {
        const existingIndex = prev.findIndex(
          (r) => r.lessonId === lessonId && r.date === date
        );
        const existing = existingIndex > -1 ? prev[existingIndex] : undefined;

        if (existing) {
          if (existing.status === status) {
            return prev.filter((_, idx) => idx !== existingIndex);
          }
          const updated = [...prev];
          updated[existingIndex] = { ...existing, status };
          return updated;
        }

        return [...prev, { lessonId, date, status }];
      });
    },
    []
  );

  const setAttendance = useCallback(
    (lessonId: string, date: string, status: AttendanceStatus | null) => {
      setRecords((prev) => {
        const existingIndex = prev.findIndex(
          (r) => r.lessonId === lessonId && r.date === date
        );
        const existing = existingIndex > -1 ? prev[existingIndex] : undefined;

        if (status === null) {
          return existing
            ? prev.filter((_, idx) => idx !== existingIndex)
            : prev;
        }

        if (existing) {
          if (existing.status === status) return prev;
          const updated = [...prev];
          updated[existingIndex] = { ...existing, status };
          return updated;
        }

        return [...prev, { lessonId, date, status }];
      });
    },
    []
  );

  const getStatus = useCallback(
    (lessonId: string, date: string): AttendanceStatus | null => {
      const record = records.find((r) => r.lessonId === lessonId && r.date === date);
      return record ? record.status : null;
    },
    [records]
  );

  const replaceRecords = useCallback((nextRecords: readonly AttendanceRecord[]) => {
    setRecords(sanitizeRecords(nextRecords));
  }, []);

  const mergeRecords = useCallback((incomingRecords: readonly AttendanceRecord[]) => {
    const cleanIncoming = sanitizeRecords(incomingRecords);
    setRecords((prev) => deduplicateAttendanceRecords([...prev, ...cleanIncoming]));
  }, []);

  const clearRecords = useCallback(() => {
    setRecords([]);
  }, []);

  return {
    records,
    toggleAttendance,
    setAttendance,
    getStatus,
    replaceRecords,
    mergeRecords,
    clearRecords,
    storageError,
  };
};
