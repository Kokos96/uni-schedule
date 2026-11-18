import React from 'react';
import { ArrowRight, Clock, SlidersHorizontal } from '@phosphor-icons/react';
import { DEPARTMENT_NAMES, ELECTIVE_NAMES } from '../../constants/profile';
import type { ResolvedUserSettings } from '../../types';
import type { DeadlineItem } from '../../types/notes';
import { formatShortDateUa } from '../../utils/date';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';

export interface ScheduleSidebarWidgetsProps {
  upcomingDeadlines: readonly DeadlineItem[];
  todayIso: string;
  settings: ResolvedUserSettings;
  onNavigateToDeadlines?: () => void;
  onNavigateToSettings?: () => void;
}

export const ScheduleSidebarWidgets: React.FC<ScheduleSidebarWidgetsProps> = ({
  upcomingDeadlines,
  todayIso,
  settings,
  onNavigateToDeadlines,
  onNavigateToSettings,
}) => {
  return (
    <>
      <GlassCard variant="glass" padding="md" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-fg" weight="regular" aria-hidden="true" />
            <h2 className="font-serif text-sm font-semibold text-ink">
              Найближчі дедлайни
            </h2>
          </div>
          {onNavigateToDeadlines && (
            <button
              type="button"
              onClick={onNavigateToDeadlines}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-amber-fg transition-colors hover:bg-amber-soft"
            >
              <span>Усі</span>
              <ArrowRight className="h-3.5 w-3.5" weight="regular" aria-hidden="true" />
            </button>
          )}
        </div>

        {upcomingDeadlines.length === 0 ? (
          <p className="text-xs leading-relaxed text-ink-secondary">
            Активних дедлайнів немає. Додати завдання можна у вкладці «Дедлайни» або в нотатках до пари.
          </p>
        ) : (
          <ul className="space-y-2">
            {upcomingDeadlines.map((item) => {
              const isOverdue = item.dueDate < todayIso;
              return (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-2 rounded-xl border border-line/70 bg-surface/75 px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-ink">
                      {item.title}
                    </p>
                    {item.subjectName && (
                      <p className="truncate text-[11px] text-ink-secondary">
                        {item.subjectName}
                      </p>
                    )}
                  </div>
                  <MetaChip
                    variant={
                      isOverdue
                        ? 'terracotta'
                        : item.priority === 'high'
                          ? 'amber'
                          : 'neutral'
                    }
                    mono
                    className="shrink-0"
                  >
                    {formatShortDateUa(item.dueDate)}
                  </MetaChip>
                </li>
              );
            })}
          </ul>
        )}
      </GlassCard>

      <GlassCard variant="matte" padding="md" className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal
              className="h-4 w-4 text-ink-secondary"
              weight="regular"
              aria-hidden="true"
            />
            <h2 className="font-serif text-sm font-semibold text-ink">
              Активний профіль
            </h2>
          </div>
          {onNavigateToSettings && (
            <button
              type="button"
              onClick={onNavigateToSettings}
              className="rounded-lg px-2 py-1 text-xs font-medium text-ink-secondary transition-colors hover:bg-surface-elevated hover:text-ink"
            >
              Змінити
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <MetaChip variant="beige">
            {DEPARTMENT_NAMES[settings.department]}
          </MetaChip>
          <MetaChip variant="neutral">
            Підгрупа {settings.subgroup}
          </MetaChip>
          <MetaChip variant="amber">
            {ELECTIVE_NAMES[settings.electiveCourse]}
          </MetaChip>
        </div>
      </GlassCard>
    </>
  );
};
