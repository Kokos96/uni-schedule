import React, { useId } from 'react';
import { Calculator, CheckCircle2, Info, Sparkles, TrendingUp } from 'lucide-react';
import { computeAttendanceTarget } from '../../utils/attendanceMath';
import { GlassCard } from '../ui/GlassCard';
import { MetaChip } from '../ui/Badge';

const GOAL_PRESETS = [70, 75, 80, 85, 90] as const;

export interface AttendanceCalculatorProps {
  attended: number;
  total: number;
  goalPercent: number;
  onGoalChange: (nextGoal: number) => void;
  className?: string;
}

/** Return grammatically correct Ukrainian noun form for class count. */
export function pluralizePairsUa(count: number): string {
  const abs = Math.abs(Math.trunc(count));
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'пар';
  if (mod10 === 1) return 'пару';
  if (mod10 >= 2 && mod10 <= 4) return 'пари';
  return 'пар';
}

export const AttendanceCalculator: React.FC<AttendanceCalculatorProps> = ({
  attended,
  total,
  goalPercent,
  onGoalChange,
  className,
}) => {
  const sliderId = useId();
  const clampedGoal = Math.min(100, Math.max(50, Math.round(goalPercent)));
  const target = computeAttendanceTarget(attended, total, clampedGoal);

  const handleGoalUpdate = (rawValue: number) => {
    const next = Math.min(100, Math.max(50, Math.round(rawValue)));
    if (next !== clampedGoal) {
      onGoalChange(next);
    }
  };

  return (
    <GlassCard variant="glass" padding="lg" className={className}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber/30 bg-amber-soft text-amber-fg">
            <Calculator className="h-4 w-4" aria-hidden="true" />
          </div>
          <div>
            <h3 className="text-sm font-semibold tracking-[-0.01em] text-ink">
              Калькулятор цілі
            </h3>
            <p className="text-xs text-ink-secondary">
              Розрахунок запасу пропусків або необхідних відвідувань
            </p>
          </div>
        </div>

        <MetaChip variant="amber" mono>
          Ціль: {clampedGoal}%
        </MetaChip>
      </div>

      {/* Preset threshold selector */}
      <div className="mt-4 space-y-3">
        <div
          role="group"
          aria-label="Швидкий вибір цілі відвідуваності"
          className="flex flex-wrap gap-1.5"
        >
          {GOAL_PRESETS.map((preset) => {
            const isActive = clampedGoal === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={isActive}
                onClick={() => handleGoalUpdate(preset)}
                className={[
                  'min-h-[34px] flex-1 basis-[54px] rounded-xl border px-2.5 py-1.5 font-mono text-xs font-semibold tabular-nums transition-colors duration-150 active:scale-[0.97]',
                  isActive
                    ? 'border-amber/50 bg-amber-soft text-amber-fg shadow-elevated'
                    : 'border-line bg-surface-elevated/70 text-ink-secondary hover:border-line-strong hover:text-ink',
                ].join(' ')}
              >
                {preset}%
              </button>
            );
          })}
        </div>

        {/* Fine-grained 50%–100% range slider */}
        <div className="rounded-xl border border-line/80 bg-surface-elevated/50 px-3.5 py-3">
          <div className="flex items-center justify-between gap-2 text-xs">
            <label htmlFor={sliderId} className="font-medium text-ink-secondary">
              Точний поріг (50%–100%)
            </label>
            <span className="font-mono font-semibold tabular-nums text-amber-fg">
              {clampedGoal}%
            </span>
          </div>
          <input
            id={sliderId}
            type="range"
            min={50}
            max={100}
            step={1}
            value={clampedGoal}
            aria-valuetext={`${clampedGoal}%`}
            onChange={(e) => handleGoalUpdate(Number(e.target.value))}
            className="mt-2.5 h-2 w-full cursor-pointer appearance-none rounded-full bg-surface-elevated accent-[var(--accent-amber)]"
          />
          <div className="mt-1 flex justify-between font-mono text-[10px] tabular-nums text-ink-muted">
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {/* Computed outcome banner */}
      <div className="mt-4">
        {!target.hasData ? (
          <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-elevated/60 p-3.5">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-ink">
                Відмітьте хоча б одну пару в розкладі
              </p>
              <p className="text-xs leading-relaxed text-ink-secondary">
                Щойно з&apos;являться відмітки, калькулятор покаже скільки пар можна пропустити або
                потрібно відвідати для порогу {clampedGoal}%.
              </p>
            </div>
          </div>
        ) : target.isMeetingGoal ? (
          <div className="flex items-start gap-3 rounded-xl border border-sage/35 bg-sage-soft p-3.5">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-fg" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-sage-fg">
                Можна пропустити ще {target.canSkip} {pluralizePairsUa(target.canSkip)}
              </p>
              <p className="text-xs leading-relaxed text-ink-secondary">
                {target.canSkip > 0 ? (
                  <>
                    Відвідуваність не впаде нижче{' '}
                    <span className="font-mono font-medium text-ink">{clampedGoal}%</span> (зараз{' '}
                    <span className="font-mono font-medium text-ink">
                      {target.currentPercent}%
                    </span>{' '}
                    — {target.attended} з {target.total}).
                  </>
                ) : (
                  <>
                    Ви тримаєте ціль{' '}
                    <span className="font-mono font-medium text-ink">{clampedGoal}%</span>, але
                    наступний пропуск одразу знизить показник нижче порогу.
                  </>
                )}
              </p>
            </div>
          </div>
        ) : !target.isGoalReachable || target.mustAttend === null ? (
          <div className="flex items-start gap-3 rounded-xl border border-amber/35 bg-amber-soft p-3.5">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-amber-fg">
                Поріг 100% уже недосяжний
              </p>
              <p className="text-xs leading-relaxed text-ink-secondary">
                Після зафіксованої н-ки ({target.attended} з {target.total}, зараз{' '}
                <span className="font-mono font-medium text-ink">{target.currentPercent}%</span>)
                досягти рівно 100% математично неможливо. Оберіть реалістичну ціль, наприклад 90% або
                95%.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-xl border border-terracotta/35 bg-terracotta-soft p-3.5">
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-terracotta-fg" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-terracotta-fg">
                Потрібно відвідати {target.mustAttend} {pluralizePairsUa(target.mustAttend)} поспіль
              </p>
              <p className="text-xs leading-relaxed text-ink-secondary">
                Щоб піднятися з{' '}
                <span className="font-mono font-medium text-ink">{target.currentPercent}%</span> (
                {target.attended} з {target.total}) до цільових{' '}
                <span className="font-mono font-medium text-ink">{clampedGoal}%</span>.
              </p>
            </div>
          </div>
        )}
      </div>
    </GlassCard>
  );
};
