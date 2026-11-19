import type { ResolvedUserSettings } from '../types';
import { readStorage, writeStorage } from '../utils/storage';

const SYNC_TOKEN_STORAGE_KEY = 'uni_schedule_sync_token_v1';

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

  const res = await fetch(`${apiBaseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
  writeStorage(SYNC_TOKEN_STORAGE_KEY, data);
  return data;
}

export async function syncProfileToBackend(
  settings: ResolvedUserSettings
): Promise<boolean> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl || !settings.universityProfile) {
    return false;
  }

  const auth = await ensureRegisteredDevice(apiBaseUrl);
  const timezone =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Kyiv'
      : 'Europe/Kyiv';

  const res = await fetch(`${apiBaseUrl}/api/profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.syncToken}`,
    },
    body: JSON.stringify({
      universityId: settings.universityProfile.universityId,
      facultyId: settings.universityProfile.facultyId,
      facultyName: settings.universityProfile.facultyName,
      course: settings.universityProfile.course,
      groupId: settings.universityProfile.groupId,
      groupName: settings.universityProfile.groupName,
      subgroup: settings.subgroup,
      department: settings.department,
      electiveCourse: settings.electiveCourse,
      selectedElectives: settings.selectedElectives ?? [],
      selectedTrack: settings.selectedTrack ?? null,
      timezone,
    }),
  });

  if (res.status === 401) {
    clearStoredDeviceAuth();
    return false;
  }

  return res.ok;
}

export interface RemoteStudentProfile {
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

export async function fetchProfileFromBackend(): Promise<RemoteStudentProfile | null> {
  const apiBaseUrl = getApiBaseUrl();
  const auth = getStoredDeviceAuth();
  if (!apiBaseUrl || !auth?.syncToken) {
    return null;
  }

  const res = await fetch(`${apiBaseUrl}/api/profile`, {
    headers: { Authorization: `Bearer ${auth.syncToken}` },
  });

  if (res.status === 401) {
    clearStoredDeviceAuth();
    return null;
  }
  if (!res.ok) {
    return null;
  }

  const data = (await res.json()) as { profile?: RemoteStudentProfile };
  return data.profile ?? null;
}
