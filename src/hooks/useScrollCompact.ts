import { useEffect, useRef, useState } from 'react';

export interface ScrollCompactOptions {
  topThreshold?: number;
  compactThreshold?: number;
  downDelta?: number;
  upDelta?: number;
  resetKey?: string | number;
}

export function useScrollCompact({
  topThreshold = 24,
  compactThreshold = 56,
  downDelta = 8,
  upDelta = 14,
  resetKey,
}: ScrollCompactOptions = {}): boolean {
  const [isCompact, setIsCompact] = useState(false);
  const lastYRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const suppressUntilRef = useRef(0);

  useEffect(() => {
    setIsCompact(false);
    lastYRef.current = typeof window !== 'undefined' ? Math.max(0, window.scrollY) : 0;
    // Ignore programmatic scroll reset events right after tab switches to avoid flicker.
    suppressUntilRef.current = typeof performance !== 'undefined' ? performance.now() + 180 : 0;
  }, [resetKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const evaluate = () => {
      rafRef.current = null;
      const now = typeof performance !== 'undefined' ? performance.now() : 0;
      const rawY = window.scrollY;
      // Guard against iOS rubber-band overscroll at top or bottom.
      const maxScroll = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight
      );
      const y = Math.max(0, Math.min(rawY, maxScroll));

      if (now < suppressUntilRef.current) {
        lastYRef.current = y;
        return;
      }

      if (rawY <= topThreshold) {
        setIsCompact((prev) => (prev ? false : prev));
        lastYRef.current = y;
        return;
      }

      // Ignore bottom rubber-band bounce oscillations
      if (maxScroll > 0 && rawY > maxScroll) {
        return;
      }

      const delta = y - lastYRef.current;

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
