import type { AttendanceRecord, AttendanceStatus } from '../types';
import { readStorage, writeStorage } from '../utils/storage';
import {
  clearStoredDeviceAuth,
  ensureRegisteredDevice,
  getApiBaseUrl,
} from './apiClient';

export type SyncAttendanceStatus = 'attended' | 'absent' | 'excused' | 'unmarked';

export interface AttendanceMutation {
  lessonId: string;
  lessonDate: string;
  status: SyncAttendanceStatus;
  updatedAt: string;
}

export interface RemoteAttendanceRecord {
  lessonId: string;
  lessonDate: string;
  status: SyncAttendanceStatus;
  updatedAt: string;
  serverVersion?: number;
}

export const ATTENDANCE_QUEUE_KEY = 'uni_schedule_attendance_queue_v1';
export const ATTENDANCE_LAST_SYNC_KEY = 'uni_schedule_attendance_last_sync_v1';

export function toSyncStatus(status: AttendanceStatus | null): SyncAttendanceStatus {
  if (status === 'present') return 'attended';
  if (status === 'absent') return 'absent';
  if (status === 'excused') return 'excused';
  return 'unmarked';
}

export function toLocalStatus(status: SyncAttendanceStatus): AttendanceStatus | null {
  if (status === 'attended') return 'present';
  if (status === 'absent') return 'absent';
  if (status === 'excused') return 'excused';
  return null;
}

export function readPendingQueue(): AttendanceMutation[] {
  const raw = readStorage<unknown>(ATTENDANCE_QUEUE_KEY, []);
  return Array.isArray(raw) ? (raw as AttendanceMutation[]) : [];
}

export function coalesceMutation(
  queue: readonly AttendanceMutation[],
  incoming: AttendanceMutation
): AttendanceMutation[] {
  const key = `${incoming.lessonId}:${incoming.lessonDate}`;
  const map = new Map<string, AttendanceMutation>();
  for (const item of queue) {
    map.set(`${item.lessonId}:${item.lessonDate}`, item);
  }
  const existing = map.get(key);
  if (!existing || incoming.updatedAt >= existing.updatedAt) {
    map.set(key, incoming);
  }
  return Array.from(map.values());
}

export function enqueueAttendanceMutation(mutation: AttendanceMutation): void {
  const next = coalesceMutation(readPendingQueue(), mutation);
  writeStorage(ATTENDANCE_QUEUE_KEY, next);
}

export function enqueueAttendanceMutations(mutations: readonly AttendanceMutation[]): void {
  if (mutations.length === 0) return;
  let next = readPendingQueue();
  for (const mutation of mutations) {
    next = coalesceMutation(next, mutation);
  }
  writeStorage(ATTENDANCE_QUEUE_KEY, next);
}

/**
 * Merges local records with remote server records using Last-Write-Wins (`updatedAt`)
 * while protecting any un-synced offline mutations in `pendingQueue`.
 */
export function mergeAttendanceWithRemote(
  localRecords: readonly AttendanceRecord[],
  remoteRecords: readonly RemoteAttendanceRecord[],
  pendingQueue: readonly AttendanceMutation[]
): AttendanceRecord[] {
  const map = new Map<
    string,
    { status: AttendanceStatus | null; updatedAt: string; serverVersion?: number }
  >();

  for (const rec of localRecords) {
    const key = `${rec.lessonId}:${rec.date}`;
    map.set(key, {
      status: rec.status,
      updatedAt: rec.updatedAt ?? '1970-01-01T00:00:00.000Z',
      serverVersion: rec.serverVersion,
    });
  }

  for (const remote of remoteRecords) {
    const key = `${remote.lessonId}:${remote.lessonDate}`;
    const current = map.get(key);
    const remoteHasNewerVersion =
      typeof remote.serverVersion === 'number' &&
      typeof current?.serverVersion === 'number' &&
      remote.serverVersion > current.serverVersion;
    if (!current || remoteHasNewerVersion || remote.updatedAt >= current.updatedAt) {
      map.set(key, {
        status: toLocalStatus(remote.status),
        updatedAt: remote.updatedAt,
        serverVersion: remote.serverVersion,
      });
    }
  }

  for (const pending of pendingQueue) {
    const key = `${pending.lessonId}:${pending.lessonDate}`;
    const current = map.get(key);
    if (!current || pending.updatedAt >= current.updatedAt) {
      map.set(key, {
        status: toLocalStatus(pending.status),
        updatedAt: pending.updatedAt,
        serverVersion: current?.serverVersion,
      });
    }
  }

  const merged: AttendanceRecord[] = [];
  for (const [key, value] of map.entries()) {
    if (value.status === null) continue;
    const sepIdx = key.lastIndexOf(':');
    const lessonId = key.slice(0, sepIdx);
    const date = key.slice(sepIdx + 1);
    merged.push({
      lessonId,
      date,
      status: value.status,
      updatedAt: value.updatedAt,
      ...(value.serverVersion !== undefined ? { serverVersion: value.serverVersion } : {}),
    });
  }

  return merged;
}

let activeAttendanceSyncPromise: Promise<{ synced: boolean; records: AttendanceRecord[] }> | null = null;

export function syncAttendanceWithServer(
  localRecords: readonly AttendanceRecord[]
): Promise<{ synced: boolean; records: AttendanceRecord[] }> {
  if (activeAttendanceSyncPromise) {
    return activeAttendanceSyncPromise.then(() => runAttendanceSync(localRecords));
  }
  const run = runAttendanceSync(localRecords);
  activeAttendanceSyncPromise = run;
  return run.finally(() => {
    if (activeAttendanceSyncPromise === run) {
      activeAttendanceSyncPromise = null;
    }
  });
}

async function runAttendanceSync(
  localRecords: readonly AttendanceRecord[]
): Promise<{ synced: boolean; records: AttendanceRecord[] }> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || (typeof navigator !== 'undefined' && !navigator.onLine)) {
    return { synced: false, records: [...localRecords] };
  }

  const pendingSnapshot = readPendingQueue();
  const lastSyncAt = readStorage<string | null>(ATTENDANCE_LAST_SYNC_KEY, null);

  // If this is the very first sync and user has legacy local records, push them too
  const initialMutations: AttendanceMutation[] =
    !lastSyncAt && pendingSnapshot.length === 0
      ? localRecords.map((r) => ({
          lessonId: r.lessonId,
          lessonDate: r.date,
          status: toSyncStatus(r.status),
          updatedAt: r.updatedAt ?? new Date().toISOString(),
        }))
      : [];

  const mutationsToSend = [...pendingSnapshot, ...initialMutations];
  const auth = await ensureRegisteredDevice(apiBaseUrl);

  const res = await fetch(`${apiBaseUrl}/api/attendance/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.syncToken}`,
    },
    body: JSON.stringify({
      mutations: mutationsToSend,
      lastSyncAt,
    }),
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearStoredDeviceAuth();
    }
    return { synced: false, records: [...localRecords] };
  }

  const data = (await res.json()) as {
    serverTime: string;
    records: RemoteAttendanceRecord[];
  };

  // Remove only mutations that were NOT superseded while request was in flight
  const sentMap = new Map(
    mutationsToSend.map((m) => [`${m.lessonId}:${m.lessonDate}`, m.updatedAt])
  );
  const remainingQueue = readPendingQueue().filter((item) => {
    const sentAt = sentMap.get(`${item.lessonId}:${item.lessonDate}`);
    return !sentAt || item.updatedAt > sentAt;
  });

  writeStorage(ATTENDANCE_QUEUE_KEY, remainingQueue);
  writeStorage(ATTENDANCE_LAST_SYNC_KEY, data.serverTime);

  const merged = mergeAttendanceWithRemote(
    localRecords,
    data.records,
    remainingQueue
  );

  return { synced: true, records: merged };
}
