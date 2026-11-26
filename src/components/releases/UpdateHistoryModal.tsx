import React from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import type { ReleaseEntry } from '../../data/releases';
import { MetaChip } from '../ui/Badge';
import { ModalDrawer } from '../ui/ModalDrawer';

export interface UpdateHistoryModalProps {
  open: boolean;
  releases: readonly ReleaseEntry[];
  installedVersion: string;
  onClose: () => void;
}

function formatDateUa(isoDate: string | null): string {
  if (!isoDate) return 'Незабаром';
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export const UpdateHistoryModal: React.FC<UpdateHistoryModalProps> = ({
  open,
  releases,
  installedVersion,
  onClose,
}) => {
  return (
    <ModalDrawer
      open={open}
      onClose={onClose}
      title="Історія оновлень"
      description="Усі підтверджені версії Uni Schedule"
    >
      <div className="space-y-4" data-testid="update-history-modal-content">
        {releases.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-secondary">
            Історія оновлень наразі недоступна.
          </p>
        ) : (
          <div className="space-y-3">
            {releases.map((rel) => {
              const isCurrent = rel.version === installedVersion;
              return (
                <article
                  key={rel.id}
                  data-testid={`history-release-${rel.version}`}
                  className="space-y-2.5 rounded-xl border border-line bg-surface-elevated/55 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <MetaChip variant={isCurrent ? 'amber' : 'neutral'} mono>
                        v{rel.version}
                      </MetaChip>
                      <span className="font-mono text-[11px] text-ink-secondary">
                        {formatDateUa(rel.publishedAt)}
                      </span>
                    </div>
                    {rel.githubReleaseUrl && (
                      <a
                        href={rel.githubReleaseUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-secondary transition-colors hover:text-amber-fg"
                      >
                        <span>GitHub</span>
                        <ArrowUpRight weight="regular" className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  <div>
                    <h4 className="font-serif text-sm font-bold text-ink">{rel.ukTitle}</h4>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                      {rel.summary}
                    </p>
                  </div>

                  {rel.features.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-amber-fg">
                        Нове
                      </p>
                      <ul className="space-y-1 text-xs leading-relaxed text-ink">
                        {rel.features.map((f, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber" aria-hidden="true" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rel.improvements.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-sage-fg">
                        Покращення
                      </p>
                      <ul className="space-y-1 text-xs leading-relaxed text-ink">
                        {rel.improvements.map((imp, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                            <span>{imp}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {rel.fixes.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
                        Виправлення
                      </p>
                      <ul className="space-y-1 text-xs leading-relaxed text-ink">
                        {rel.fixes.map((fix, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-ink-secondary" aria-hidden="true" />
                            <span>{fix}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated px-4 text-xs font-semibold text-ink hover:border-line-strong"
          >
            Закрити
          </button>
        </div>
      </div>
    </ModalDrawer>
  );
};
