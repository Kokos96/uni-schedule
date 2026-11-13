import { useEffect, useMemo, useState } from 'react';
import { Lesson } from '../types';
import { timeStringToSeconds } from '../utils/date';

export type PairStatus =
  | 'before_first'
  | 'in_lesson'
  | 'break'
  | 'after_last'
  | 'no_classes';

export interface CurrentPairState {
  currentLesson: Lesson | undefined;
  nextLesson: Lesson | undefined;
  status: PairStatus;
  elapsedMinutes: number;
  remainingMinutes: number;
  remainingSeconds: number;
  progressPercent: number;
  secondsUntilNext: number;
  currentTimeStr: string;
}

function formatCurrentTime(now: Date): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function computePairSnapshot(
  sortedLessons: readonly Lesson[],
  now: Date,
  isToday: boolean
): CurrentPairState {
  const currentTimeStr = formatCurrentTime(now);

  const firstLesson = sortedLessons[0];
  if (!isToday || !firstLesson) {
    return {
      currentLesson: undefined,
      nextLesson: undefined,
      status: 'no_classes',
      elapsedMinutes: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      progressPercent: 0,
      secondsUntilNext: 0,
      currentTimeStr,
    };
  }

  const nowSeconds =
    now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();

  const currentIndex = sortedLessons.findIndex((lesson) => {
    const startSec = timeStringToSeconds(lesson.startTime);
    const endSec = timeStringToSeconds(lesson.endTime);
    return nowSeconds >= startSec && nowSeconds < endSec;
  });
  const currentLesson = currentIndex > -1 ? sortedLessons[currentIndex] : undefined;

  if (currentLesson) {
    const startSec = timeStringToSeconds(currentLesson.startTime);
    const endSec = timeStringToSeconds(currentLesson.endTime);
    const totalSec = Math.max(1, endSec - startSec);
    const elapsedSec = Math.max(0, nowSeconds - startSec);
    const remainingSeconds = Math.max(0, endSec - nowSeconds);

    const nextLesson = sortedLessons.find(
      (lesson, idx) => idx > currentIndex && timeStringToSeconds(lesson.startTime) >= endSec
    );
    const secondsUntilNext = nextLesson
      ? Math.max(0, timeStringToSeconds(nextLesson.startTime) - nowSeconds)
      : 0;

    return {
      currentLesson,
      nextLesson,
      status: 'in_lesson',
      elapsedMinutes: Math.floor(elapsedSec / 60),
      remainingMinutes: Math.ceil(remainingSeconds / 60),
      remainingSeconds,
      progressPercent: Math.min(
        100,
        Math.max(0, Number(((elapsedSec / totalSec) * 100).toFixed(1)))
      ),
      secondsUntilNext,
      currentTimeStr,
    };
  }

  const firstStartSec = timeStringToSeconds(firstLesson.startTime);
  if (nowSeconds < firstStartSec) {
    return {
      currentLesson: undefined,
      nextLesson: firstLesson,
      status: 'before_first',
      elapsedMinutes: 0,
      remainingMinutes: 0,
      remainingSeconds: 0,
      progressPercent: 0,
      secondsUntilNext: Math.max(0, firstStartSec - nowSeconds),
      currentTimeStr,
    };
  }

  const nextLesson = sortedLessons.find(
    (lesson) => timeStringToSeconds(lesson.startTime) > nowSeconds
  );

  if (nextLesson) {
    let prevEndSec = firstStartSec;
    for (const lesson of sortedLessons) {
      const endSec = timeStringToSeconds(lesson.endTime);
      if (endSec <= nowSeconds && endSec > prevEndSec) {
        prevEndSec = endSec;
      }
    }

    const nextStartSec = timeStringToSeconds(nextLesson.startTime);
    const breakTotalSec = Math.max(1, nextStartSec - prevEndSec);
    const breakElapsedSec = Math.max(0, nowSeconds - prevEndSec);
    const remainingSeconds = Math.max(0, nextStartSec - nowSeconds);

    return {
      currentLesson: undefined,
      nextLesson,
      status: 'break',
      elapsedMinutes: Math.floor(breakElapsedSec / 60),
      remainingMinutes: Math.ceil(remainingSeconds / 60),
      remainingSeconds,
      progressPercent: Math.min(
        100,
        Math.max(0, Number(((breakElapsedSec / breakTotalSec) * 100).toFixed(1)))
      ),
      secondsUntilNext: remainingSeconds,
      currentTimeStr,
    };
  }

  return {
    currentLesson: undefined,
    nextLesson: undefined,
    status: 'after_last',
    elapsedMinutes: 0,
    remainingMinutes: 0,
    remainingSeconds: 0,
    progressPercent: 0,
    secondsUntilNext: 0,
    currentTimeStr,
  };
}

export interface UseCurrentPairOptions {
  liveCountdown?: boolean;
}

/**
 * Track live lesson/break status using local system clock.
 * When `liveCountdown` is true (default), ticks every 1s during active lesson/break
 * for smooth countdowns, or every 30s otherwise. When false, ticks every 30s + visibility/focus.
 */
export const useCurrentPair = (
  lessons: readonly Lesson[],
  isToday = true,
  options?: UseCurrentPairOptions
): CurrentPairState => {
  const liveCountdown = options?.liveCountdown ?? true;
  const [now, setNow] = useState<Date>(() => new Date());

  const sortedLessons = useMemo(
    () =>
      [...lessons].sort(
        (a, b) =>
          timeStringToSeconds(a.startTime) - timeStringToSeconds(b.startTime)
      ),
    [lessons]
  );

  const snapshot = useMemo(
    () => computePairSnapshot(sortedLessons, now, isToday),
    [sortedLessons, now, isToday]
  );

  const isLiveCountdown =
    liveCountdown &&
    isToday &&
    (snapshot.status === 'in_lesson' || snapshot.status === 'break');

  useEffect(() => {
    if (!isToday) return;

    setNow(new Date());
    const intervalMs = isLiveCountdown ? 1000 : 30000;
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [isToday, isLiveCountdown]);

  useEffect(() => {
    if (!isToday || typeof document === 'undefined') return;

    const syncClock = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
      }
    };

    document.addEventListener('visibilitychange', syncClock);
    window.addEventListener('focus', syncClock);

    return () => {
      document.removeEventListener('visibilitychange', syncClock);
      window.removeEventListener('focus', syncClock);
    };
  }, [isToday]);

  return snapshot;
};
