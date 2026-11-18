import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatIsoDate, isSameDay } from '../utils/date';

/**
 * Tracks the current calendar date (`todayDate` / `todayIso`) and keeps it
 * synchronized across midnight rollovers and window/visibility wakeups.
 */
export function useTodayDate() {
  const [todayDate, setTodayDate] = useState<Date>(() => new Date());
  const todayIso = useMemo(() => formatIsoDate(todayDate), [todayDate]);

  useEffect(() => {
    const syncToday = () => {
      const now = new Date();
      setTodayDate((prev) => (isSameDay(prev, now) ? prev : now));
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        syncToday();
      }
    };

    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
      0,
      0,
      1,
      0
    );
    const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());
    const midnightTimer = window.setTimeout(syncToday, msUntilMidnight);

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', syncToday);

    return () => {
      window.clearTimeout(midnightTimer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', syncToday);
    };
  }, [todayIso]);

  const refreshToday = useCallback((): Date => {
    const now = new Date();
    setTodayDate(now);
    return now;
  }, []);

  return { todayDate, todayIso, refreshToday };
}
