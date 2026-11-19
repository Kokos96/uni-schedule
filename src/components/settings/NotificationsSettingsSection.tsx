import React, { useEffect, useState } from 'react';
import {
  Bell,
  BellSlash,
  DeviceMobile,
  Info,
} from '@phosphor-icons/react';
import { getApiBaseUrl } from '../../services/apiClient';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  getCurrentPushSubscription,
  isIosDevice,
  isPushSupported,
  isStandalonePwa,
  subscribeDeviceToPush,
  syncNotificationPreferences,
  unsubscribeDeviceFromPush,
  type NotificationPreferences,
} from '../../services/pushClient';
import { readStorage, writeStorage } from '../../utils/storage';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';
import { useToast } from '../ui/Toast';

const PUSH_PREFS_KEY = 'uni_schedule_push_prefs_v1';

export const NotificationsSettingsSection: React.FC = () => {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPreferences>(() =>
    readStorage<NotificationPreferences>(
      PUSH_PREFS_KEY,
      DEFAULT_NOTIFICATION_PREFERENCES
    )
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  const pushSupported = isPushSupported();
  const isIos = isIosDevice();
  const standalone = isStandalonePwa();
  const apiConfigured = Boolean(getApiBaseUrl());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sub = await getCurrentPushSubscription();
        if (!cancelled) {
          setIsSubscribed(Boolean(sub));
        }
      } catch {
        // Ignore if SW is not active yet
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const updatePrefs = (patch: Partial<NotificationPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    writeStorage(PUSH_PREFS_KEY, next);
    if (apiConfigured && isSubscribed) {
      void syncNotificationPreferences(next).catch(() => {});
    }
  };

  const handleEnablePush = async () => {
    setBusy(true);
    try {
      await subscribeDeviceToPush();
      setIsSubscribed(true);
      const next = { ...prefs, enabled: true };
      setPrefs(next);
      writeStorage(PUSH_PREFS_KEY, next);
      await syncNotificationPreferences(next);
      toast.success('Push-сповіщення увімкнено');
    } catch (err) {
      toast.warning(
        err instanceof Error ? err.message : 'Не вдалося увімкнути сповіщення'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDisablePush = async () => {
    setBusy(true);
    try {
      await unsubscribeDeviceFromPush();
      setIsSubscribed(false);
      updatePrefs({ enabled: false });
      toast.info('Push-сповіщення вимкнено для цього пристрою');
    } catch {
      toast.warning('Не вдалося відписатися від сповіщень');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GlassCard variant="glass" padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          <Bell weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
          <span>Сповіщення (Push)</span>
        </div>

        <MetaChip
          variant={
            isSubscribed
              ? 'sage'
              : isIos && !standalone
                ? 'amber'
                : 'neutral'
          }
          mono
        >
          {isSubscribed
            ? 'Підписано'
            : isIos && !standalone
              ? 'Потрібен Home Screen'
              : 'Вимкнено'}
        </MetaChip>
      </div>

      {isIos && !standalone && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber/35 bg-amber-soft/70 p-3 text-xs text-ink">
          <DeviceMobile weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
          <div className="space-y-1 leading-relaxed">
            <p className="font-semibold">Для iPhone / iPad (iOS Safari):</p>
            <p className="text-ink-secondary">
              1. Натисніть «Поділитися» ➔ «На початковий екран».
              <br />
              2. Відкрийте застосунок з іконки на робочому столі та натисніть «Увімкнути сповіщення».
            </p>
          </div>
        </div>
      )}

      {!apiConfigured && (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-elevated/60 p-3 text-[11px] leading-relaxed text-ink-secondary">
          <Info weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
          <span>
            Серверний Cron/VAPID API (<code className="font-mono">VITE_API_BASE_URL</code>) ще не підключений у цьому середовищі. Налаштування збережуться локально.
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!isSubscribed ? (
          <button
            type="button"
            disabled={busy || !pushSupported || (isIos && !standalone)}
            onClick={() => void handleEnablePush()}
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-3.5 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50"
          >
            <Bell weight="bold" className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Увімкнути сповіщення</span>
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDisablePush()}
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-line bg-surface-elevated px-3.5 text-xs font-semibold text-ink-secondary transition-colors hover:border-terracotta/45 hover:text-terracotta-fg disabled:opacity-50"
          >
            <BellSlash weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Вимкнути на цьому пристрої</span>
          </button>
        )}
      </div>

      {/* Granular Notification Preferences */}
      <div className="space-y-2.5 border-t border-line/70 pt-3">
        <div className="flex items-center justify-between gap-3">
          <label htmlFor="push-morning-time" className="text-xs font-medium text-ink">
            Ранковий дайджест
          </label>
          <div className="flex items-center gap-2">
            <input
              id="push-morning-time"
              type="time"
              value={prefs.morningTime}
              onChange={(e) => updatePrefs({ morningTime: e.target.value })}
              className="rounded-lg border border-line bg-surface-elevated/70 px-2 py-1 font-mono text-xs text-ink"
            />
            <input
              type="checkbox"
              aria-label="Увімкнути ранковий дайджест"
              checked={prefs.morningEnabled}
              onChange={(e) => updatePrefs({ morningEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#D88B45]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="push-before-min" className="text-xs font-medium text-ink">
            Перед початком пари
          </label>
          <div className="flex items-center gap-2">
            <select
              id="push-before-min"
              value={prefs.beforeLessonMinutes}
              onChange={(e) =>
                updatePrefs({
                  beforeLessonMinutes: Number(e.target.value) as 5 | 10 | 15 | 30,
                })
              }
              className="rounded-lg border border-line bg-surface-elevated/70 px-2 py-1 font-mono text-xs text-ink"
            >
              <option value={5}>5 хв</option>
              <option value={10}>10 хв</option>
              <option value={15}>15 хв</option>
              <option value={30}>30 хв</option>
            </select>
            <input
              type="checkbox"
              aria-label="Увімкнути нагадування перед парою"
              checked={prefs.beforeLessonEnabled}
              onChange={(e) => updatePrefs({ beforeLessonEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#D88B45]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="push-end-min" className="text-xs font-medium text-ink">
            До завершення пари
          </label>
          <div className="flex items-center gap-2">
            <select
              id="push-end-min"
              value={prefs.beforeEndMinutes}
              onChange={(e) =>
                updatePrefs({
                  beforeEndMinutes: Number(e.target.value) as 5 | 10 | 15,
                })
              }
              className="rounded-lg border border-line bg-surface-elevated/70 px-2 py-1 font-mono text-xs text-ink"
            >
              <option value={5}>5 хв</option>
              <option value={10}>10 хв</option>
              <option value={15}>15 хв</option>
            </select>
            <input
              type="checkbox"
              aria-label="Увімкнути нагадування до завершення пари"
              checked={prefs.beforeEndEnabled}
              onChange={(e) => updatePrefs({ beforeEndEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#D88B45]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="push-evening-time" className="text-xs font-medium text-ink">
            Вечірній підсумок дня
          </label>
          <div className="flex items-center gap-2">
            <input
              id="push-evening-time"
              type="time"
              value={prefs.eveningTime}
              onChange={(e) => updatePrefs({ eveningTime: e.target.value })}
              className="rounded-lg border border-line bg-surface-elevated/70 px-2 py-1 font-mono text-xs text-ink"
            />
            <input
              type="checkbox"
              aria-label="Увімкнути вечірній підсумок"
              checked={prefs.eveningEnabled}
              onChange={(e) => updatePrefs({ eveningEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#D88B45]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <label htmlFor="push-friday-time" className="text-xs font-medium text-ink">
            П'ятничний підсумок тижня
          </label>
          <div className="flex items-center gap-2">
            <input
              id="push-friday-time"
              type="time"
              value={prefs.fridayTime}
              onChange={(e) => updatePrefs({ fridayTime: e.target.value })}
              className="rounded-lg border border-line bg-surface-elevated/70 px-2 py-1 font-mono text-xs text-ink"
            />
            <input
              type="checkbox"
              aria-label="Увімкнути п'ятничний підсумок"
              checked={prefs.fridayEnabled}
              onChange={(e) => updatePrefs({ fridayEnabled: e.target.checked })}
              className="h-4 w-4 accent-[#D88B45]"
            />
          </div>
        </div>
      </div>
    </GlassCard>
  );
};
