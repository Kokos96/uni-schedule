import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from '@phosphor-icons/react';
import { cn } from '../../utils/cn';

export interface ModalDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidthClassName?: string;
  className?: string;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  ariaLabel?: string;
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : false
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

export const ModalDrawer: React.FC<ModalDrawerProps> = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidthClassName = 'md:max-w-[480px]',
  className,
  closeOnBackdrop = true,
  showCloseButton = true,
  ariaLabel,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isDesktop = useIsDesktop();
  const prefersReducedMotion = useReducedMotion();

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [open]);

  // Escape key & focus trap / restoration
  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;

    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      if (!panel.contains(document.activeElement)) {
        const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable) {
          firstFocusable.focus({ preventScroll: true });
        } else {
          panel.focus({ preventScroll: true });
        }
      }
    }, 10);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab' && panelRef.current) {
        const focusables = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
        ).filter((el) => el.offsetParent !== null);

        if (focusables.length === 0) {
          e.preventDefault();
          panelRef.current.focus();
          return;
        }

        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus({ preventScroll: true });
      }
    };
  }, [open]);

  if (typeof document === 'undefined') return null;

  const panelVariants = prefersReducedMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
      }
    : isDesktop
      ? {
          initial: { opacity: 0, scale: 0.96, y: 8 },
          animate: { opacity: 1, scale: 1, y: 0 },
          exit: { opacity: 0, scale: 0.97, y: 6 },
        }
      : {
          initial: { opacity: 0, y: '100%' },
          animate: { opacity: 1, y: 0 },
          exit: { opacity: 0, y: '100%' },
        };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-4">
          {/* Scrim */}
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0.12 : 0.18 }}
            onClick={closeOnBackdrop ? onClose : undefined}
            style={{ backgroundColor: 'var(--backdrop-scrim)' }}
            className="fixed inset-0 backdrop-blur-[3px]"
          />

          {/* Dialog / Bottom Sheet Surface */}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-label={!title ? ariaLabel : undefined}
            aria-describedby={description ? descriptionId : undefined}
            tabIndex={-1}
            initial={panelVariants.initial}
            animate={panelVariants.animate}
            exit={panelVariants.exit}
            transition={
              prefersReducedMotion
                ? { duration: 0.12 }
                : isDesktop
                  ? { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                  : { type: 'spring', stiffness: 420, damping: 36, mass: 0.85 }
            }
            className={cn(
              'glass-strong relative z-10 flex w-full flex-col overflow-hidden outline-none',
              'max-h-[90dvh] rounded-t-3xl rounded-b-none pb-safe',
              'md:max-h-[85dvh] md:rounded-2xl md:pb-0',
              maxWidthClassName,
              className
            )}
          >
            {/* Mobile Drag Handle */}
            <div className="flex justify-center pt-2.5 pb-1 md:hidden" aria-hidden="true">
              <span className="h-1 w-9 rounded-full bg-line-strong/80" />
            </div>

            {/* Header */}
            {(title || description || showCloseButton) && (
              <div className="flex items-start justify-between gap-3 border-b border-line/70 px-5 pt-3 pb-3.5 md:pt-4">
                <div className="min-w-0 flex-1">
                  {title && (
                    <h2
                      id={titleId}
                      className="font-serif text-base font-semibold leading-[1.35] tracking-[-0.015em] text-ink"
                    >
                      {title}
                    </h2>
                  )}
                  {description && (
                    <p
                      id={descriptionId}
                      className="mt-1 text-xs leading-relaxed text-ink-secondary"
                    >
                      {description}
                    </p>
                  )}
                </div>
                {showCloseButton && (
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Закрити"
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-ink-secondary transition-colors duration-150 hover:border-line hover:bg-surface-elevated hover:text-ink active:scale-[0.97]"
                  >
                    <X className="h-4 w-4" weight="bold" aria-hidden="true" />
                  </button>
                )}
              </div>
            )}

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {children}
            </div>

            {/* Optional Footer */}
            {footer && (
              <div className="border-t border-line/70 px-5 py-3.5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};
