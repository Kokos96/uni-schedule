import { useCallback, useEffect, useRef, useState } from 'react';

interface SwUpdateEventDetail {
  registration?: ServiceWorkerRegistration;
  worker?: ServiceWorker;
  applyUpdate?: () => void;
}

export interface UseOnlineStatusResult {
  isOnline: boolean;
  updateAvailable: boolean;
  applyUpdate: () => void;
  dismissUpdate: () => void;
}

/** Track network connectivity and Service Worker update availability. */
export const useOnlineStatus = (): UseOnlineStatusResult => {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(false);

  const applyUpdateRef = useRef<(() => void) | null>(null);
  const reloadingRef = useRef<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const handleSwUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<SwUpdateEventDetail>;
      const detail = customEvent.detail;
      if (detail?.applyUpdate) {
        applyUpdateRef.current = detail.applyUpdate;
      } else if (detail?.worker) {
        const worker = detail.worker;
        applyUpdateRef.current = () => worker.postMessage({ type: 'SKIP_WAITING' });
      }
      setUpdateAvailable(true);
    };

    window.addEventListener('sw-update-available', handleSwUpdate);

    const handleControllerChange = () => {
      if (reloadingRef.current) return;
      reloadingRef.current = true;
      window.location.reload();
    };

    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('sw-update-available', handleSwUpdate);
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener(
          'controllerchange',
          handleControllerChange
        );
      }
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (applyUpdateRef.current) {
      applyUpdateRef.current();
    } else if (typeof window !== 'undefined') {
      window.location.reload();
    }
    setUpdateAvailable(false);
  }, []);

  const dismissUpdate = useCallback(() => {
    setUpdateAvailable(false);
  }, []);

  return {
    isOnline,
    updateAvailable,
    applyUpdate,
    dismissUpdate,
  };
};
