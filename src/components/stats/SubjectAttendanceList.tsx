import React from 'react';
import type { SubjectAttendanceStat } from '../../utils/attendanceMath';
import {
  AnimatedProgressBar,
  StaggerCard,
  StaggerList,
} from '../motion/MotionPrimitives';
import { MetaChip } from '../ui/Badge';
import { EmptyAttendanceIllustration } from '../ui/EditorialOrnaments';
import { EmptyState } from '../ui/EmptyState';
import { GlassCard } from '../ui/GlassCard';

function getSubjectBarClass(stat: SubjectAttendanceStat): string {
  if (stat.target.isMeetingGoal) {
    return 'bg-none bg-sage';
  }
  if (
    !stat.target.isGoalReachable ||
    (stat.percentage !== null && stat.percentage >= stat.target.goalPercent - 15)
  ) {
    return 'bg-none bg-amber';
  }
  return 'bg-none bg-terracotta';
}

export interface SubjectAttendanceListProps {
  subjectStats: readonly SubjectAttendanceStat[];
  heading: string;
  onlyMyLessons: boolean;
  hiddenByFilterCount: number;
  onShowAllLessons: () => void;
}

export const SubjectAttendanceList: React.FC<SubjectAttendanceListProps> = ({
  subjectStats,
  heading,
  onlyMyLessons,
  hiddenByFilterCount,
  onShowAllLessons,
}) => {
  return (
    <section aria-labelledby="subjects-breakdown-heading" className="space-y-4 lg:col-span-12">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3
          id="subjects-breakdown-heading"
          className="font-serif text-base font-semibold tracking-[-0.015em] text-ink"
        >
          {heading}
        </h3>
        {subjectStats.length > 0 && (
          <span className="font-mono text-xs tabular-nums text-ink-secondary">
            Дисциплін: {subjectStats.length}
          </span>
        )}
      </div>

      {subjectStats.length === 0 ? (
        <GlassCard variant="matte" padding="none">
          <EmptyState
            illustration={<EmptyAttendanceIllustration />}
            title={onlyMyLessons && hiddenByFilterCount > 0
              ? 'Немає зіставлених відміток для поточного профілю'
              : 'Відміток за цей період ще немає'}
            description={
              onlyMyLessons && hiddenByFilterCount > 0
                ? 'У вибраному періоді немає записів, що відповідають поточному розкладу та фільтру профілю. Збережені відмітки можна переглянути, вимкнувши фільтр.'
                : 'Відмічайте статус кожної пари прямо у картці розкладу, щоб бачити статистику за предметами.'
            }
            showUnderline
            action={
              onlyMyLessons && hiddenByFilterCount > 0
                ? {
                    label: 'Показати всі відмітки',
                    onClick: onShowAllLessons,
                  }
                : undefined
            }
          />
        </GlassCard>
      ) : (
        <StaggerList
          itemCount={subjectStats.length}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {subjectStats.map((stat) => {
            const pct = stat.percentage ?? 0;
            const badgeVariant = stat.target.isMeetingGoal
              ? 'sage'
              : !stat.target.isGoalReachable
                ? 'amber'
                : 'terracotta';

            const badgeLabel = stat.target.isMeetingGoal
              ? `Запас: +${stat.target.canSkip}`
              : !stat.target.isGoalReachable || stat.target.mustAttend === null
                ? '100% недосяжна'
                : `Потрібно: ${stat.target.mustAttend}`;

            return (
              <StaggerCard key={stat.subjectName} interactive>
                <GlassCard variant="matte" padding="md" className="flex h-full flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <h4 className="font-serif text-sm font-semibold leading-snug text-ink">
                      {stat.subjectName}
                    </h4>
                    <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-ink">
                      {stat.percentage !== null ? `${stat.percentage}%` : '—'}
                    </span>
                  </div>

                  <AnimatedProgressBar
                    value={pct}
                    label={`Відвідуваність з предмету ${stat.subjectName}`}
                    barClassName={getSubjectBarClass(stat)}
                    shimmer={false}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-[11px] text-ink-secondary">
                    <div className="flex items-center gap-2 font-mono tabular-nums">
                      <span className="text-sage-fg">Був: {stat.present}</span>
                      <span>·</span>
                      <span className="text-amber-fg">Пов.: {stat.excused}</span>
                      <span>·</span>
                      <span className="text-terracotta-fg">Н-ка: {stat.absent}</span>
                    </div>

                    <MetaChip variant={badgeVariant} mono>
                      {badgeLabel}
                    </MetaChip>
                  </div>
                </GlassCard>
              </StaggerCard>
            );
          })}
        </StaggerList>
      )}
    </section>
  );
};
