import type { ResolvedUserSettings, ScheduleSourceMode } from '../types';
import { readStorage, writeStorage } from '../utils/storage';

const SYNC_TOKEN_STORAGE_KEY = 'uni_schedule_sync_token_v1';
let registrationInFlight: Promise<StoredDeviceAuth> | null = null;

export interface StoredDeviceAuth {
  userId: string;
  deviceId: string;
  syncToken: string;
}

export function getApiBaseUrl(): string | null {
  try {
    const raw = (import.meta as { env?: Record<string, unknown> }).env
      ?.VITE_API_BASE_URL;
    if (typeof raw === 'string' && raw.trim().length > 0) {
      return raw.trim().replace(/\/+$/, '');
    }
  } catch {
    // Non-Vite test environment
  }
  return null;
}

export function getStoredDeviceAuth(): StoredDeviceAuth | null {
  return readStorage<StoredDeviceAuth | null>(SYNC_TOKEN_STORAGE_KEY, null);
}

export function clearStoredDeviceAuth(): void {
  writeStorage(SYNC_TOKEN_STORAGE_KEY, null);
}

export async function ensureRegisteredDevice(
  apiBaseUrl: string
): Promise<StoredDeviceAuth> {
  const existing = getStoredDeviceAuth();
  if (existing?.syncToken) {
    return existing;
  }

  if (!registrationInFlight) {
    registrationInFlight = (async () => {
      const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          deviceName:
            typeof navigator !== 'undefined'
              ? navigator.userAgent.slice(0, 48)
              : 'Web Client',
        }),
      });
      if (!res.ok) {
        throw new Error(`Не вдалося зареєструвати пристрій (HTTP ${res.status})`);
      }
      const data = (await res.json()) as StoredDeviceAuth;
      if (!data || typeof data.syncToken !== 'string' ||
          typeof data.userId !== 'string' || typeof data.deviceId !== 'string') {
        throw new Error('Сервер повернув некоректні дані реєстрації пристрою.');
      }
      writeStorage(SYNC_TOKEN_STORAGE_KEY, data);
      return data;
    })();
  }
  const flight = registrationInFlight;
  try {
    return await flight;
  } finally {
    if (registrationInFlight === flight) registrationInFlight = null;
  }
}

export type ProfileWriteResult =
  | { status: 'ok'; revision: number }
  | { status: 'conflict'; revision: number }
  | { status: 'unauthorized' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string };

export async function syncProfileToBackend(
  settings: ResolvedUserSettings,
  expectedRevision: number
): Promise<ProfileWriteResult> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || settings.scheduleSourceMode === 'unconfigured') {
    return { status: 'unavailable' };
  }
  if (settings.scheduleSourceMode === 'live' && !settings.universityProfile) {
    return { status: 'error', message: 'Не вибрано академічну групу.' };
  }

  const auth = await ensureRegisteredDevice(apiBaseUrl);
  const timezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
      : 'Europe/Kyiv';

  const res = await fetch(`${apiBaseUrl}/api/profile`, {
    method: 'PUT',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.syncToken}`,
    },
    body: JSON.stringify({
      sourceMode: settings.scheduleSourceMode,
      expectedRevision,
      ...(settings.universityProfile ? {
        universityId: settings.universityProfile.universityId,
        facultyId: settings.universityProfile.facultyId,
        facultyName: settings.universityProfile.facultyName,
        course: settings.universityProfile.course,
        groupId: settings.universityProfile.groupId,
        groupName: settings.universityProfile.groupName,
      } : {}),
      subgroup: settings.subgroup,
      department: settings.department,
      electiveCourse: settings.electiveCourse,
      selectedElectives: settings.selectedElectives ?? [],
      selectedTrack: settings.selectedTrack ?? null,
      timezone,
    }),
  });

  if (res.status === 401) {
    return { status: 'unauthorized' };
  }
  if (res.status === 409) {
    const conflict = await res.json().catch(() => null) as { profile?: { revision?: number }; revision?: number } | null;
    return {
      status: 'conflict',
      revision: conflict?.profile?.revision ?? conflict?.revision ?? expectedRevision,
    };
  }
  if (!res.ok) {
    return { status: 'error', message: `Профіль не збережено (HTTP ${res.status})` };
  }
  const data = await res.json().catch(() => null) as { profile?: { revision?: number } } | null;
  const revision = data?.profile?.revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 1) {
    return { status: 'error', message: 'Сервер не підтвердив версію профілю.' };
  }
  return { status: 'ok', revision };
}

export interface RemoteStudentProfile {
  sourceMode: ScheduleSourceMode;
  revision: number;
  universityId: string;
  facultyId?: string;
  facultyName?: string;
  course?: number;
  groupId: string;
  groupName: string;
  subgroup: 1 | 2;
  department?: string;
  electiveCourse: string;
  selectedElectives?: string[];
  selectedTrack?: number;
}

export type ProfileReadResult =
  | { status: 'ok'; profile: RemoteStudentProfile }
  | { status: 'missing' | 'unavailable' | 'unauthorized' };

export async function readProfileFromBackend(): Promise<ProfileReadResult> {
  const apiBaseUrl = getApiBaseUrl();
  const auth = getStoredDeviceAuth();
  if (!apiBaseUrl || !auth?.syncToken) return { status: 'unavailable' };

  const res = await fetch(`${apiBaseUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${auth.syncToken}` },
    cache: 'no-store',
  });
  if (res.status === 401) {
    return { status: 'unauthorized' };
  }
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) return { status: 'unavailable' };
  const data = await res.json().catch(() => null) as { profile?: RemoteStudentProfile } | null;
  if (!data?.profile || !Number.isInteger(data.profile.revision)) return { status: 'unavailable' };
  return { status: 'ok', profile: data.profile };
}

export async function fetchProfileFromBackend(): Promise<RemoteStudentProfile | null> {
  const result = await readProfileFromBackend();
  return result.status === 'ok' ? result.profile : null;
}
