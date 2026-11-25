import type { ResolvedUserSettings } from '../types';
import { readStorage, writeStorage } from '../utils/storage';
import type { ProfileWriteResult } from './apiClient';

const PENDING_KEY = 'uni_schedule_profile_pending_v1';
const REVISION_KEY = 'uni_schedule_profile_revision_v1';

export type ProfileSyncStatus = 'idle' | 'pending' | 'syncing' | 'synced' | 'error' | 'conflict';

interface PendingProfile {
  settings: ResolvedUserSettings;
  signature: string;
}

export function profileSignature(settings: ResolvedUserSettings): string {
  return JSON.stringify({
    mode: settings.scheduleSourceMode,
    profile: settings.universityProfile ?? null,
    subgroup: settings.subgroup,
    department: settings.department,
    electiveCourse: settings.electiveCourse,
    selectedElectives: settings.selectedElectives ?? [],
    selectedTrack: settings.selectedTrack ?? null,
  });
}

function readRevision(): number {
  const value = readStorage<unknown>(REVISION_KEY, 0);
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

function readPending(): PendingProfile | null {
  const value = readStorage<unknown>(PENDING_KEY, null);
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<PendingProfile>;
  if (!candidate.settings || typeof candidate.signature !== 'string') return null;
  if (candidate.settings.scheduleSourceMode !== 'builtin' &&
      candidate.settings.scheduleSourceMode !== 'live' &&
      candidate.settings.scheduleSourceMode !== 'manual') return null;
  if (candidate.signature !== profileSignature(candidate.settings)) return null;
  return candidate as PendingProfile;
}

export class ProfileSyncQueue {
  private pending: PendingProfile | null = readPending();
  private revision = readRevision();
  private running = false;
  private flushAgain = false;
  private disposed = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2_000;
  private conflictRevision: number | null = null;

  constructor(
    private readonly write: (settings: ResolvedUserSettings, revision: number) => Promise<ProfileWriteResult>,
    private readonly onStatus: (status: ProfileSyncStatus, error: string | null) => void
  ) {}

  get hasPending(): boolean { return this.pending !== null; }
  get pendingSettings(): ResolvedUserSettings | null { return this.pending?.settings ?? null; }
  get currentRevision(): number { return this.revision; }

  setRevision(revision: number): void {
    if (!Number.isInteger(revision) || revision < this.revision) return;
    this.revision = revision;
    writeStorage(REVISION_KEY, revision);
  }

  enqueue(settings: ResolvedUserSettings): void {
    if (settings.scheduleSourceMode === 'unconfigured') return;
    this.pending = { settings, signature: profileSignature(settings) };
    this.conflictRevision = null;
    writeStorage(PENDING_KEY, this.pending);
    this.onStatus('pending', null);
    this.clearTimer();
    if (this.running) this.flushAgain = true;
    void this.flush();
  }

  start(): void {
    this.disposed = false;
    if (this.pending) {
      this.onStatus(this.conflictRevision === null ? 'pending' : 'conflict',
        this.conflictRevision === null ? null : 'Профіль змінено на іншому пристрої. Підтвердіть свій вибір.');
      if (this.running) this.flushAgain = true;
      void this.flush();
    }
  }

  retry(): void {
    if (!this.pending || this.conflictRevision !== null) return;
    this.clearTimer();
    void this.flush();
  }

  confirmLocalIntent(): void {
    if (!this.pending || this.conflictRevision === null) return;
    this.setRevision(this.conflictRevision);
    this.conflictRevision = null;
    this.onStatus('pending', null);
    void this.flush();
  }

  dispose(): void {
    this.disposed = true;
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private scheduleRetry(): void {
    if (this.disposed || !this.pending || this.retryTimer) return;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      void this.flush();
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, 60_000);
  }

  private async flush(): Promise<void> {
    if (this.running || this.disposed || !this.pending) return;
    this.running = true;
    try {
      while (!this.disposed && this.pending && this.conflictRevision === null) {
        const current: PendingProfile = this.pending;
        this.onStatus('syncing', null);
        let result: ProfileWriteResult;
        try {
          result = await this.write(current.settings, this.revision);
        } catch {
          this.onStatus('error', 'Немає зв’язку із сервером. Профіль буде повторно синхронізовано.');
          this.scheduleRetry();
          break;
        }
        if (result.status === 'ok') {
          this.setRevision(result.revision);
          this.retryDelay = 2_000;
          if (this.pending?.signature === current.signature) {
            this.pending = null;
            writeStorage(PENDING_KEY, null);
            this.onStatus('synced', null);
          }
          continue;
        }
        if (result.status === 'conflict') {
          this.conflictRevision = result.revision;
          this.onStatus('conflict', 'Профіль змінено на іншому пристрої. Підтвердіть, якщо хочете застосувати свій вибір.');
          break;
        }
        const message = result.status === 'unauthorized'
          ? 'Доступ до профілю втрачено. Перевірте підключення пристрою.'
          : result.status === 'error'
            ? result.message
            : 'Сервер профілю недоступний. Зміни збережено локально.';
        this.onStatus('error', message);
        if (result.status !== 'unauthorized') this.scheduleRetry();
        break;
      }
    } finally {
      this.running = false;
      // An update may have arrived after the loop's last pending check.
      if (this.flushAgain && this.pending && !this.disposed && this.conflictRevision === null) {
        this.flushAgain = false;
        queueMicrotask(() => void this.flush());
      }
    }
  }
}
