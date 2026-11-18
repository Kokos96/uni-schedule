import {
  ensureRegisteredDevice,
  getApiBaseUrl,
  getStoredDeviceAuth,
} from './apiClient';

export interface NotificationPreferences {
  enabled: boolean;
  morningEnabled: boolean;
  morningTime: string;
  beforeLessonEnabled: boolean;
  beforeLessonMinutes: 5 | 10 | 15 | 30;
  beforeEndEnabled: boolean;
  beforeEndMinutes: 5 | 10 | 15;
  eveningEnabled: boolean;
  eveningTime: string;
  fridayEnabled: boolean;
  fridayTime: string;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  morningEnabled: true,
  morningTime: '08:00',
  beforeLessonEnabled: true,
  beforeLessonMinutes: 10,
  beforeEndEnabled: false,
  beforeEndMinutes: 10,
  eveningEnabled: true,
  eveningTime: '20:00',
  fridayEnabled: true,
  fridayTime: '18:00',
};

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    'serviceWorker' in navigator &&
    'PushManager' in window
  );
}

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    nav.standalone === true
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function getCurrentPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeDeviceToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) {
    throw new Error('Цей браузер не підтримує Web Push Notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Дозвіл на сповіщення не надано.');
  }

  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) {
    throw new Error(
      'Не налаштовано VITE_API_BASE_URL (серверний API Cloudflare Worker).'
    );
  }

  const vapidRes = await fetch(`${apiBaseUrl}/api/push/vapid-public-key`);
  if (!vapidRes.ok) {
    throw new Error('Публічний VAPID-ключ недоступний на сервері.');
  }
  const { publicKey } = (await vapidRes.json()) as { publicKey: string };

  const reg = await navigator.serviceWorker.ready;
  let subscription = await reg.pushManager.getSubscription();
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
    });
  }

  const auth = await ensureRegisteredDevice(apiBaseUrl);
  const json = subscription.toJSON();
  const saveRes = await fetch(`${apiBaseUrl}/api/push/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.syncToken}`,
    },
    body: JSON.stringify({
      endpoint: subscription.endpoint,
      keys: {
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
      },
    }),
  });

  if (!saveRes.ok) {
    throw new Error(`Не вдалося зберегти підписку на сервері (HTTP ${saveRes.status})`);
  }

  return subscription;
}

export async function unsubscribeDeviceFromPush(): Promise<void> {
  const existing = await getCurrentPushSubscription();
  if (existing) {
    await existing.unsubscribe();
  }

  const apiBaseUrl = getApiBaseUrl();
  const auth = getStoredDeviceAuth();
  if (apiBaseUrl && auth?.syncToken) {
    const listRes = await fetch(`${apiBaseUrl}/api/push/subscriptions`, {
      headers: { Authorization: `Bearer ${auth.syncToken}` },
    });
    if (listRes.ok) {
      const data = (await listRes.json()) as {
        subscriptions?: Array<{ id: string; isCurrentDevice?: boolean }>;
      };
      const current = data.subscriptions?.find((s) => s.isCurrentDevice);
      if (current) {
        await fetch(`${apiBaseUrl}/api/push/subscriptions/${current.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${auth.syncToken}` },
        });
      }
    }
  }
}

export async function syncNotificationPreferences(
  prefs: NotificationPreferences
): Promise<boolean> {
  const apiBaseUrl = getApiBaseUrl();
  if (!apiBaseUrl) return false;
  const auth = await ensureRegisteredDevice(apiBaseUrl);
  const res = await fetch(`${apiBaseUrl}/api/notifications/preferences`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.syncToken}`,
    },
    body: JSON.stringify(prefs),
  });
  return res.ok;
}
