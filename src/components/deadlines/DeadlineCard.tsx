import React from 'react';
import {
  ArrowSquareOut,
  Calendar,
  Check,
  Fire,
  PencilSimple,
  Trash,
  Warning,
} from '@phosphor-icons/react';
import type { DeadlineItem } from '../../types/notes';
import { cn } from '../../utils/cn';
import { formatShortDateUa } from '../../utils/date';
import { normalizeExternalUrl } from '../../utils/url';
import { StaggerCard } from '../motion/MotionPrimitives';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';

export interface DeadlineCardProps {
  item: DeadlineItem;
  todayIso: string;
  isConfirmingDelete: boolean;
  onToggle: (item: DeadlineItem) => void;
  onEdit: (item: DeadlineItem) => void;
  onRequestDelete: (id: string) => void;
  onConfirmDelete: (item: DeadlineItem) => void;
  onCancelDelete: () => void;
}

export const DeadlineCard: React.FC<DeadlineCardProps> = ({
  item,
  todayIso,
  isConfirmingDelete,
  onToggle,
  onEdit,
  onRequestDelete,
  onConfirmDelete,
  onCancelDelete,
}) => {
  const isOverdue = !item.completed && item.dueDate < todayIso;
  const isDueToday = !item.completed && item.dueDate === todayIso;
  const safeLink = item.link ? normalizeExternalUrl(item.link) : null;

  return (
    <StaggerCard interactive={false}>
      <GlassCard
        variant={
          item.completed
            ? 'matte'
            : isOverdue || item.priority === 'high'
              ? 'glass'
              : 'matte'
        }
        padding="md"
        className={cn(
          'transition-all duration-150',
          item.completed && 'border-sage/30 opacity-85',
          isOverdue && 'border-terracotta/45'
        )}
      >
        <div className="flex items-start gap-3">
          {/* Sage Checkbox Toggle */}
          <button
            type="button"
            role="checkbox"
            aria-checked={item.completed}
            aria-label={
              item.completed
                ? `Позначити «${item.title}» як невиконане`
                : `Позначити «${item.title}» як виконане`
            }
            onClick={() => onToggle(item)}
            className={cn(
              'mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-150 active:scale-[0.94]',
              item.completed
                ? 'border-sage bg-sage text-[#242522] shadow-elevated'
                : 'border-line-strong bg-surface-elevated/70 text-transparent hover:border-sage/60 hover:text-sage-fg/50'
            )}
          >
            <Check weight="bold" className="h-4 w-4" aria-hidden="true" />
          </button>

          {/* Content */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <MetaChip
                  variant={item.priority === 'high' ? 'terracotta' : 'neutral'}
                  icon={
                    item.priority === 'high' ? (
                      <Fire weight="duotone" className="h-3 w-3" />
                    ) : undefined
                  }
                >
                  {item.priority === 'high' ? 'Терміново' : 'Звичайний'}
                </MetaChip>

                <MetaChip
                  variant={
                    item.completed
                      ? 'sage'
                      : isOverdue
                        ? 'terracotta'
                        : isDueToday
                          ? 'amber'
                          : 'neutral'
                  }
                  mono
                  icon={
                    isOverdue ? (
                      <Warning weight="duotone" className="h-3 w-3" />
                    ) : (
                      <Calendar weight="regular" className="h-3 w-3" />
                    )
                  }
                >
                  {isOverdue ? 'Прострочено · ' : ''}
                  {formatShortDateUa(item.dueDate)}
                  {item.dueTime ? ` · ${item.dueTime}` : ''}
                </MetaChip>

                {item.subjectName && (
                  <MetaChip variant="beige">{item.subjectName}</MetaChip>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1">
                {!isConfirmingDelete ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onEdit(item)}
                      aria-label={`Редагувати «${item.title}»`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
                    >
                      <PencilSimple weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRequestDelete(item.id)}
                      aria-label={`Видалити «${item.title}»`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary transition-colors hover:bg-terracotta-soft hover:text-terracotta-fg"
                    >
                      <Trash weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </>
                ) : (
                  <div className="flex items-center gap-1 rounded-xl border border-terracotta/40 bg-terracotta-soft px-2 py-1">
                    <button
                      type="button"
                      onClick={() => onConfirmDelete(item)}
                      className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-terracotta-fg hover:underline"
                    >
                      Видалити
                    </button>
                    <button
                      type="button"
                      onClick={onCancelDelete}
                      className="rounded-md px-1.5 py-0.5 text-[11px] text-ink-secondary hover:text-ink"
                    >
                      Ні
                    </button>
                  </div>
                )}
              </div>
            </div>

            <h3
              className={cn(
                'font-serif text-[17px] font-medium leading-snug',
                item.completed
                  ? 'text-sage-fg line-through decoration-sage/60'
                  : 'text-ink'
              )}
            >
              {item.title}
            </h3>

            {item.notes && (
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-ink-secondary">
                {item.notes}
              </p>
            )}

            {safeLink && (
              <div className="pt-0.5">
                <a
                  href={safeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber/30 bg-amber-soft px-2.5 py-1 text-xs font-medium text-amber-fg transition-colors hover:border-amber/55"
                >
                  <ArrowSquareOut
                    weight="regular"
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>Матеріали</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </GlassCard>
    </StaggerCard>
  );
};
