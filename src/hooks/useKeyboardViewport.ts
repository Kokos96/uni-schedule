import { useEffect, useRef, useState } from 'react';

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'range',
  'button',
  'submit',
  'reset',
  'file',
  'color',
  'hidden',
]);

function isEditableTarget(el: EventTarget | null): boolean {
  if (!el || !(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
}

export interface KeyboardViewportState {
  isKeyboardOpen: boolean;
}

/**
 * Tracks mobile virtual keyboard presence using focus events + Visual Viewport API.
 * Distinguishes keyboard height reduction from browser pinch-zoom (`visualViewport.scale > 1.05`)
 * and gently clears horizontal displacement after keyboard dismissal.
 */
export function useKeyboardViewport(): KeyboardViewportState {
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const editableFocusedRef = useRef(false);
  const baselineHeightRef = useRef<number>(
    typeof window !== 'undefined' ? window.innerHeight : 844
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobileViewport = () => window.innerWidth < 1024;
    let dismissTimer: number | null = null;

    const updateState = () => {
      if (!isMobileViewport()) {
        setIsKeyboardOpen((prev) => (prev ? false : prev));
        return;
      }

      const vv = window.visualViewport;
      const scale = vv?.scale ?? 1;
      const isZoomed = scale > 1.05;

      // Update resting baseline height only when not zoomed and no editable is focused
      if (!isZoomed && !editableFocusedRef.current) {
        baselineHeightRef.current = Math.max(window.innerHeight, vv?.height ?? window.innerHeight);
      }

      if (isZoomed) {
        // Do not confuse pinch-zoom with keyboard open
        setIsKeyboardOpen((prev) => (prev ? false : prev));
        return;
      }

      const vvHeight = vv?.height ?? window.innerHeight;
      const heightDrop = Math.max(window.innerHeight, baselineHeightRef.current) - vvHeight;
      const keyboardDetected =
        editableFocusedRef.current && (heightDrop >= 110 || 'ontouchstart' in window);

      setIsKeyboardOpen((prev) => (prev === keyboardDetected ? prev : keyboardDetected));
    };

    const onFocusIn = (e: FocusEvent) => {
      if (isEditableTarget(e.target)) {
        if (dismissTimer !== null) {
          window.clearTimeout(dismissTimer);
          dismissTimer = null;
        }
        editableFocusedRef.current = true;
        updateState();
      }
    };

    const onFocusOut = () => {
      // Wait one tick to see if focus moved to another editable control
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
      dismissTimer = window.setTimeout(() => {
        dismissTimer = null;
        editableFocusedRef.current = isEditableTarget(document.activeElement);
        updateState();
        if (!editableFocusedRef.current && window.scrollX !== 0) {
          window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' as ScrollBehavior });
        }
      }, 60);
    };

    const onOrientationOrVisibility = () => {
      baselineHeightRef.current = window.innerHeight;
      editableFocusedRef.current = isEditableTarget(document.activeElement);
      updateState();
    };

    document.addEventListener('focusin', onFocusIn, true);
    document.addEventListener('focusout', onFocusOut, true);
    window.addEventListener('orientationchange', onOrientationOrVisibility, { passive: true });
    document.addEventListener('visibilitychange', onOrientationOrVisibility, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', updateState, { passive: true });
    }

    return () => {
      if (dismissTimer !== null) window.clearTimeout(dismissTimer);
      document.removeEventListener('focusin', onFocusIn, true);
      document.removeEventListener('focusout', onFocusOut, true);
      window.removeEventListener('orientationchange', onOrientationOrVisibility);
      document.removeEventListener('visibilitychange', onOrientationOrVisibility);
      if (vv) {
        vv.removeEventListener('resize', updateState);
      }
    };
  }, []);

  return { isKeyboardOpen };
}
