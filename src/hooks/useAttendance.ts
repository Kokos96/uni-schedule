import { useCallback, useEffect, useRef, useState } from 'react';
import {
  enqueueAttendanceMutation,
  enqueueAttendanceMutations,
  syncAttendanceWithServer,
  toSyncStatus,
} from '../services/attendanceSync';
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
        ...(typeof candidate.updatedAt === 'string'
          ? { updatedAt: candidate.updatedAt }
          : {}),
        ...(typeof candidate.serverVersion === 'number' &&
        Number.isFinite(candidate.serverVersion)
          ? { serverVersion: candidate.serverVersion }
          : {}),
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
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    const result = writeStorage(STORAGE_KEY, records);
    setStorageError(result.ok ? null : (result.error ?? 'unknown'));
  }, [records]);

  const triggerSync = useCallback(() => {
    void syncAttendanceWithServer(recordsRef.current)
      .then((res) => {
        if (res.synced) {
          setRecords(res.records);
        }
      })
      .catch(() => {
        // Offline / server unavailable: pending queue preserves changes safely
      });
  }, []);

  useEffect(() => {
    triggerSync();
    const handleOnline = () => triggerSync();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [triggerSync]);

  const toggleAttendance = useCallback(
    (lessonId: string, date: string, status: AttendanceStatus) => {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(15);
        } catch {
          // Ignore vibration restrictions on unsupported browsers
        }
      }

      const nowIso = new Date().toISOString();
      const existingBefore = recordsRef.current.find(
        (r) => r.lessonId === lessonId && r.date === date
      );
      const nextMutationStatus: AttendanceStatus | null =
        existingBefore?.status === status ? null : status;

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
          updated[existingIndex] = { ...existing, status, updatedAt: nowIso };
          return updated;
        }

        return [...prev, { lessonId, date, status, updatedAt: nowIso }];
      });

      enqueueAttendanceMutation({
        lessonId,
        lessonDate: date,
        status: toSyncStatus(nextMutationStatus),
        updatedAt: nowIso,
      });
      triggerSync();
    },
    [triggerSync]
  );

  const setAttendance = useCallback(
    (lessonId: string, date: string, status: AttendanceStatus | null) => {
      const nowIso = new Date().toISOString();

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
          updated[existingIndex] = { ...existing, status, updatedAt: nowIso };
          return updated;
        }

        return [...prev, { lessonId, date, status, updatedAt: nowIso }];
      });

      enqueueAttendanceMutation({
        lessonId,
        lessonDate: date,
        status: toSyncStatus(status),
        updatedAt: nowIso,
      });
      triggerSync();
    },
    [triggerSync]
  );

  const getStatus = useCallback(
    (lessonId: string, date: string): AttendanceStatus | null => {
      const record = records.find((r) => r.lessonId === lessonId && r.date === date);
      return record ? record.status : null;
    },
    [records]
  );

  const replaceRecords = useCallback(
    (nextRecords: readonly AttendanceRecord[]) => {
      const nowIso = new Date().toISOString();
      const prev = recordsRef.current;
      const cleanNext = sanitizeRecords(nextRecords).map((r) => ({
        lessonId: r.lessonId,
        date: r.date,
        status: r.status,
        updatedAt: r.updatedAt && r.updatedAt > nowIso ? r.updatedAt : nowIso,
      }));
      const nextKeys = new Set(cleanNext.map((r) => `${r.lessonId}::${r.date}`));
      const mutations = [
        ...prev
          .filter((r) => !nextKeys.has(`${r.lessonId}::${r.date}`))
          .map((r) => ({
            lessonId: r.lessonId,
            lessonDate: r.date,
            status: toSyncStatus(null),
            updatedAt: nowIso,
          })),
        ...cleanNext.map((r) => ({
          lessonId: r.lessonId,
          lessonDate: r.date,
          status: toSyncStatus(r.status),
          updatedAt: r.updatedAt,
        })),
      ];
      setRecords(cleanNext);
      enqueueAttendanceMutations(mutations);
      triggerSync();
    },
    [triggerSync]
  );

  const mergeRecords = useCallback(
    (incomingRecords: readonly AttendanceRecord[]) => {
      const nowIso = new Date().toISOString();
      const prev = recordsRef.current;
      const cleanIncoming = sanitizeRecords(incomingRecords).map((r) => ({
        lessonId: r.lessonId,
        date: r.date,
        status: r.status,
        updatedAt: r.updatedAt ?? nowIso,
      }));
      const prevMap = new Map(prev.map((r) => [`${r.lessonId}::${r.date}`, r]));
      const merged = deduplicateAttendanceRecords([...prev, ...cleanIncoming]);
      const mutations = merged
        .filter((rec) => {
          const old = prevMap.get(`${rec.lessonId}::${rec.date}`);
          return !old || old.status !== rec.status || (rec.updatedAt ?? '') > (old.updatedAt ?? '');
        })
        .map((rec) => ({
          lessonId: rec.lessonId,
          lessonDate: rec.date,
          status: toSyncStatus(rec.status),
          updatedAt: rec.updatedAt ?? nowIso,
        }));
      setRecords(merged);
      enqueueAttendanceMutations(mutations);
      triggerSync();
    },
    [triggerSync]
  );

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
