import { useEffect, useRef, useState } from 'react';

export interface ScrollCompactOptions {
  topThreshold?: number;
  compactThreshold?: number;
  downDelta?: number;
  upDelta?: number;
  resetKey?: string | number;
}

export function useScrollCompact({
  topThreshold = 20,
  compactThreshold = 48,
  downDelta = 6,
  upDelta = 12,
  resetKey,
}: ScrollCompactOptions = {}): boolean {
  const [isCompact, setIsCompact] = useState(false);
  const lastYRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setIsCompact(false);
    lastYRef.current = typeof window !== 'undefined' ? Math.max(0, window.scrollY) : 0;
  }, [resetKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const evaluate = () => {
      rafRef.current = null;
      const y = Math.max(0, window.scrollY);
      const delta = y - lastYRef.current;

      if (y <= topThreshold) {
        setIsCompact((prev) => (prev ? false : prev));
        lastYRef.current = y;
        return;
      }

      if (delta >= downDelta && y >= compactThreshold) {
        setIsCompact((prev) => (prev ? prev : true));
        lastYRef.current = y;
      } else if (delta <= -upDelta) {
        setIsCompact((prev) => (prev ? false : prev));
        lastYRef.current = y;
      }
    };

    const onScroll = () => {
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(evaluate);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, [topThreshold, compactThreshold, downDelta, upDelta]);

  return isCompact;
}
