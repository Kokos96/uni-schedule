export type StorageErrorCode = 'unavailable' | 'quota_exceeded' | 'unknown';

export interface StorageWriteResult {
  ok: boolean;
  error?: StorageErrorCode;
}

/** Check whether browser localStorage is accessible in the current environment. */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Safely read and JSON-parse a value from localStorage.
 * Returns `fallback` if storage is unavailable, JSON is malformed, or validator fails.
 */
export function readStorage<T>(
  key: string,
  fallback: T,
  validator?: (value: unknown) => value is T
): T {
  if (!isStorageAvailable()) return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;

    const parsed: unknown = JSON.parse(raw);
    if (validator && !validator(parsed)) {
      return fallback;
    }

    return parsed as T;
  } catch {
    return fallback;
  }
}

function isQuotaExceededError(err: unknown): boolean {
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) {
    return (
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      err.code === 22 ||
      err.code === 1014
    );
  }
  return false;
}

/**
 * Safely JSON-stringify and persist a value in localStorage.
 * Guards against private-mode restrictions and QuotaExceededError.
 */
export function writeStorage<T>(key: string, value: T): StorageWriteResult {
  if (!isStorageAvailable()) {
    return { ok: false, error: 'unavailable' };
  }

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (err) {
    if (isQuotaExceededError(err)) {
      return { ok: false, error: 'quota_exceeded' };
    }
    return { ok: false, error: 'unknown' };
  }
}

/** Safely remove a key from localStorage. */
export function removeStorage(key: string): boolean {
  if (!isStorageAvailable()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Generate a unique ID using crypto.randomUUID with a safe fallback. */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const timePart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 10);
  return `id_${timePart}_${randPart}`;
}
