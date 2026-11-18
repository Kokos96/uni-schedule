import React, { Component } from 'react';
import { ArrowCounterClockwise, Warning } from '@phosphor-icons/react';
import { GlassCard } from '../ui/GlassCard';

export interface RootErrorBoundaryProps {
  children: React.ReactNode;
}

interface RootErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class RootErrorBoundary extends Component<
  RootErrorBoundaryProps,
  RootErrorBoundaryState
> {
  public state: RootErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  public static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || null,
    };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Unhandled application error:', error, info);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): React.ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-canvas text-ink flex items-center justify-center p-4">
        <GlassCard
          variant="glass-strong"
          brackets
          padding="lg"
          className="w-full max-w-md space-y-4"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-terracotta/40 bg-terracotta-soft text-terracotta-fg">
              <Warning className="h-5 w-5" weight="duotone" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] text-amber-fg">
                uni-schedule 2.0
              </span>
              <h1 className="mt-0.5 font-serif text-xl font-medium text-ink">
                Виникла непередбачена помилка
              </h1>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-ink-secondary">
            Інтерфейс зіткнувся з неочікуваним збоєм. Ваші відмітки, нотатки та
            дедлайни збережені локально — перезавантажте сторінку для відновлення
            роботи.
          </p>

          {this.state.errorMessage && (
            <div className="rounded-xl border border-line bg-surface-elevated/65 px-3 py-2 font-mono text-[11px] text-ink-secondary break-words">
              {this.state.errorMessage}
            </div>
          )}

          <button
            type="button"
            onClick={this.handleReload}
            className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-amber/40 bg-amber px-4 text-sm font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98]"
          >
            <ArrowCounterClockwise className="h-4 w-4 shrink-0" weight="regular" aria-hidden="true" />
            <span>Перезавантажити застосунок</span>
          </button>
        </GlassCard>
      </div>
    );
  }
}
