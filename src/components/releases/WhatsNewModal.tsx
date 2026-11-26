import React from 'react';
import {
  ArrowUpRight,
  CheckCircle,
  ClockCounterClockwise,
  Sparkle,
  Wrench,
} from '@phosphor-icons/react';
import {
  INSTALLED_APP_VERSION,
  compareSemver,
  type ReleaseEntry,
} from '../../data/releases';
import { MetaChip } from '../ui/Badge';
import { ModalDrawer } from '../ui/ModalDrawer';

export interface WhatsNewModalProps {
  open: boolean;
  release: ReleaseEntry | null;
  installedVersion?: string;
  onClose: () => void;
  onOpenHistory?: () => void;
}

function formatReleaseDateUa(isoDate: string | null): string {
  if (!isoDate) return 'Підготовка до релізу';
  const parsed = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return parsed.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export const WhatsNewModal: React.FC<WhatsNewModalProps> = ({
  open,
  release,
  installedVersion = INSTALLED_APP_VERSION,
  onClose,
  onOpenHistory,
}) => {
  if (!release) return null;

  const isNewerThanInstalled = compareSemver(release.version, installedVersion) > 0;

  return (
    <ModalDrawer
      open={open}
      onClose={onClose}
      title="Що нового?"
      description={`Uni Schedule v${release.version} · ${formatReleaseDateUa(release.publishedAt)}`}
    >
      <div className="space-y-4" data-testid="whats-new-modal-content">
        <div className="flex flex-wrap items-center gap-2">
          <MetaChip variant="amber" mono>
            v{release.version}
          </MetaChip>
          {isNewerThanInstalled ? (
            <MetaChip variant="sage">Доступне оновлення</MetaChip>
          ) : (
            <MetaChip variant="neutral">Встановлено</MetaChip>
          )}
        </div>

        <div className="space-y-1.5">
          <h3 className="font-serif text-base font-bold tracking-tight text-ink">
            {release.ukTitle}
          </h3>
          <p className="text-xs leading-relaxed text-ink-secondary">
            {release.summary}
          </p>
        </div>

        {release.features.length > 0 && (
          <section className="space-y-2 rounded-xl border border-line bg-surface-elevated/55 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-amber-fg">
              <Sparkle weight="duotone" className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Нове</span>
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink">
              {release.features.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {release.improvements.length > 0 && (
          <section className="space-y-2 rounded-xl border border-line bg-surface-elevated/55 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-sage-fg">
              <CheckCircle weight="duotone" className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Покращення</span>
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink">
              {release.improvements.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sage" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {release.fixes.length > 0 && (
          <section className="space-y-2 rounded-xl border border-line bg-surface-elevated/55 p-3.5">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-secondary">
              <Wrench weight="duotone" className="h-3.5 w-3.5 text-amber-fg" aria-hidden="true" />
              <span>Виправлення</span>
            </div>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink">
              {release.fixes.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-secondary" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {onOpenHistory && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-line bg-surface-elevated px-3 text-xs font-semibold text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
              >
                <ClockCounterClockwise weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Історія оновлень</span>
              </button>
            )}
            {release.githubReleaseUrl && (
              <a
                href={release.githubReleaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-line bg-surface-elevated px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-amber/40 hover:text-amber-fg"
              >
                <span>GitHub</span>
                <ArrowUpRight weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-[40px] items-center justify-center rounded-xl border border-amber/45 bg-amber px-5 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98]"
          >
            Зрозуміло
          </button>
        </div>
      </div>
    </ModalDrawer>
  );
};
