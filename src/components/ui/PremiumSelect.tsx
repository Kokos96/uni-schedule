import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CaretDown, Check, MagnifyingGlass, X } from '@phosphor-icons/react';
import { useAppReducedMotion } from '../../lib/motion';
import { cn } from '../../utils/cn';

export interface PremiumSelectOption {
  value: string;
  label: string;
  description?: string;
  badge?: string;
}

export interface PremiumSelectProps {
  id: string;
  label: string;
  value: string;
  options: readonly PremiumSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  errorMessage?: string | null;
  searchable?: boolean;
  searchPlaceholder?: string;
  filterOption?: (option: PremiumSelectOption, query: string) => boolean;
  headerAction?: React.ReactNode;
  footerAction?: React.ReactNode;
  sheetSubtitle?: string;
  allowCustomValue?: boolean;
  customValueLabel?: (query: string) => string;
}

const EASE_SHEET = [0.22, 1, 0.36, 1] as const;

export const PremiumSelect: React.FC<PremiumSelectProps> = ({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = 'Оберіть варіант',
  disabled = false,
  loading = false,
  emptyMessage = 'Варіантів не знайдено',
  errorMessage,
  searchable = false,
  searchPlaceholder = 'Пошук…',
  filterOption,
  headerAction,
  footerAction,
  sheetSubtitle,
  allowCustomValue = false,
  customValueLabel,
}) => {
  const reducedMotion = useAppReducedMotion();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : true
  );
  const [popoverRect, setPopoverRect] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
    maxHeight: number;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const selectedOption = useMemo(
    () => options.find((opt) => opt.value === value) ?? null,
    [options, value]
  );

  const filteredOptions = useMemo(() => {
    const q = query.trim();
    if (!q) return options;
    if (filterOption) {
      return options.filter((opt) => filterOption(opt, q));
    }
    const lower = q.toLocaleLowerCase('uk-UA');
    return options.filter(
      (opt) =>
        opt.label.toLocaleLowerCase('uk-UA').includes(lower) ||
        (opt.description && opt.description.toLocaleLowerCase('uk-UA').includes(lower))
    );
  }, [options, query, filterOption]);

  const recomputePosition = () => {
    if (!triggerRef.current || typeof window === 'undefined') return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;
    const openUp = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(160, Math.min(320, openUp ? spaceAbove - 8 : spaceBelow - 8));
    setPopoverRect({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - rect.width - 12)),
      width: Math.min(rect.width, window.innerWidth - 24),
      openUp,
      maxHeight,
    });
  };

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const selectedIdx = options.findIndex((o) => o.value === value);
    setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);

    if (!isMobile) {
      recomputePosition();
      window.addEventListener('resize', recomputePosition, { passive: true });
      window.addEventListener('scroll', recomputePosition, { passive: true, capture: true });
    } else {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }

    return () => {
      window.removeEventListener('resize', recomputePosition);
      window.removeEventListener('scroll', recomputePosition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) =>
          filteredOptions.length > 0 ? Math.min(i + 1, filteredOptions.length - 1) : 0
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && document.activeElement !== searchInputRef.current) {
        if (filteredOptions[highlightedIndex]) {
          e.preventDefault();
          onChange(filteredOptions[highlightedIndex]!.value);
          setOpen(false);
          triggerRef.current?.focus();
        }
      }
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    if (!isMobile) {
      document.addEventListener('mousedown', onPointerDown);
    }
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, isMobile, filteredOptions, highlightedIndex, onChange]);

  const handleSelect = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    // Restore focus cleanly without opening mobile keyboard
    window.setTimeout(() => {
      triggerRef.current?.focus();
    }, 10);
  };

  const displayLabel = selectedOption?.label ?? (value ? value : placeholder);
  const hasValue = Boolean(selectedOption || value);
  const trimmedQuery = query.trim();
  const showCustomApply =
    allowCustomValue &&
    trimmedQuery.length > 0 &&
    !filteredOptions.some(
      (opt) => opt.value.toLocaleLowerCase('uk-UA') === trimmedQuery.toLocaleLowerCase('uk-UA')
    );

  const optionsListContent = (
    <>
      {searchable && (
        <div className="border-b border-line/70 p-2.5">
          <div className="relative">
            <MagnifyingGlass
              weight="regular"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
              aria-hidden="true"
            />
            <input
              ref={searchInputRef}
              id={`${id}-search`}
              type="text"
              autoComplete="off"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setHighlightedIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (filteredOptions.length === 1) {
                    handleSelect(filteredOptions[0]!.value);
                  } else if (filteredOptions[highlightedIndex]) {
                    handleSelect(filteredOptions[highlightedIndex]!.value);
                  } else if (showCustomApply) {
                    handleSelect(trimmedQuery);
                  }
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-xl border border-line bg-surface py-2.5 pl-9 pr-8 text-[16px] leading-snug text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none md:text-sm"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Очистити пошук"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-muted hover:text-ink"
              >
                <X weight="bold" className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        id={`${id}-listbox`}
        role="listbox"
        aria-label={label}
        style={!isMobile && popoverRect ? { maxHeight: popoverRect.maxHeight } : undefined}
        className={cn(
          'overflow-y-auto overscroll-contain p-1.5',
          isMobile ? 'max-h-[54dvh]' : ''
        )}
      >
        {loading ? (
          <div className="px-3 py-4 text-center text-xs text-ink-secondary">
            Завантаження…
          </div>
        ) : errorMessage ? (
          <div className="px-3 py-4 text-xs text-terracotta-fg">{errorMessage}</div>
        ) : filteredOptions.length === 0 && !showCustomApply ? (
          <div className="space-y-2.5 px-3 py-4 text-xs text-ink-secondary">
            <p>{emptyMessage}</p>
            {footerAction}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={`${opt.value}-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    'flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] transition-colors',
                    isSelected
                      ? 'bg-amber-soft font-semibold text-amber-fg'
                      : highlightedIndex === idx && !isMobile
                        ? 'bg-surface text-ink'
                        : 'text-ink hover:bg-surface'
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <span className="block whitespace-normal break-words leading-snug">{opt.label}</span>
                    {opt.description && (
                      <span className="mt-0.5 block whitespace-normal break-words text-[11.5px] font-normal leading-snug text-ink-secondary">
                        {opt.description}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {opt.badge && (
                      <span className="font-mono text-[11px] font-medium text-ink-secondary">
                        {opt.badge}
                      </span>
                    )}
                    {isSelected && (
                      <Check weight="bold" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
                    )}
                  </div>
                </button>
              );
            })}
            {showCustomApply && (
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(trimmedQuery)}
                className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-amber/35 bg-amber-soft/60 px-3 py-2 text-left text-[13px] font-semibold text-amber-fg"
              >
                <span>
                  {customValueLabel
                    ? customValueLabel(trimmedQuery)
                    : `Обрати «${trimmedQuery}»`}
                </span>
              </button>
            )}
            {footerAction && filteredOptions.length > 0 && (
              <div className="border-t border-line/60 pt-1.5">{footerAction}</div>
            )}
          </div>
        )}
      </div>
    </>
  );

  const portalOverlay =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open &&
              (isMobile ? (
                <div
                  key={`${id}-sheet-root`}
                  className="fixed inset-0 z-[90] flex flex-col justify-end"
                >
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reducedMotion ? 0.06 : 0.18 }}
                    onClick={() => setOpen(false)}
                    className="absolute inset-0 bg-black/55"
                    aria-hidden="true"
                  />
                  <motion.div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={label}
                    initial={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                    animate={reducedMotion ? { opacity: 1 } : { y: 0 }}
                    exit={reducedMotion ? { opacity: 0 } : { y: '100%' }}
                    transition={{ duration: reducedMotion ? 0.08 : 0.28, ease: EASE_SHEET }}
                    className="relative z-10 w-full rounded-t-[24px] border-t border-line bg-surface-elevated pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-16px_40px_rgba(0,0,0,0.42)]"
                  >
                    <div className="flex justify-center pt-2.5 pb-1">
                      <span className="h-1 w-10 rounded-full bg-line-strong" aria-hidden="true" />
                    </div>
                    <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 pb-3 pt-1">
                      <div className="min-w-0">
                        <h3 className="truncate font-serif text-base font-bold text-ink">
                          {label}
                        </h3>
                        {sheetSubtitle && (
                          <p className="mt-0.5 truncate text-xs text-ink-secondary">
                            {sheetSubtitle}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        aria-label="Закрити"
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line bg-surface text-ink-secondary hover:text-ink"
                      >
                        <X weight="bold" className="h-4 w-4" />
                      </button>
                    </div>
                    {optionsListContent}
                  </motion.div>
                </div>
              ) : (
                popoverRect && (
                  <motion.div
                    key={`${id}-popover`}
                    ref={panelRef}
                    initial={reducedMotion ? { opacity: 0 } : { opacity: 0, y: popoverRect.openUp ? 6 : -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={reducedMotion ? { opacity: 0 } : { opacity: 0, y: popoverRect.openUp ? 4 : -4, scale: 0.98 }}
                    transition={{ duration: reducedMotion ? 0.05 : 0.16, ease: EASE_SHEET }}
                    style={{
                      position: 'fixed',
                      left: popoverRect.left,
                      width: popoverRect.width,
                      ...(popoverRect.openUp
                        ? { bottom: window.innerHeight - popoverRect.top }
                        : { top: popoverRect.top }),
                    }}
                    className="z-[90] overflow-hidden rounded-2xl border border-line bg-surface-elevated shadow-[0_16px_40px_rgba(0,0,0,0.34)]"
                  >
                    {optionsListContent}
                  </motion.div>
                )
              ))}
          </AnimatePresence>,
          document.body
        )
      : null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="block text-xs font-medium text-ink-secondary">
          {label}
        </label>
        {headerAction}
      </div>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-listbox`}
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl border border-line bg-surface-elevated/80 px-3.5 py-2.5 text-left text-[13.5px] transition-colors focus:border-amber focus:outline-none disabled:opacity-55',
          open ? 'border-amber/70' : 'hover:border-line-strong'
        )}
      >
        <span className={cn('truncate', hasValue ? 'font-medium text-ink' : 'text-ink-muted')}>
          {displayLabel}
        </span>
        <CaretDown
          weight="bold"
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-ink-muted transition-transform duration-150',
            open ? 'rotate-180 text-amber-fg' : ''
          )}
          aria-hidden="true"
        />
      </button>
      {portalOverlay}
    </div>
  );
};
