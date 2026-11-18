import React from 'react';
import { GlassCard } from '../ui/GlassCard';

export const ViewSkeleton: React.FC = () => (
  <div
    aria-busy="true"
    aria-label="Завантаження розділу"
    className="space-y-5"
  >
    <div className="space-y-2.5">
      <div className="h-5 w-32 rounded-lg bg-surface-elevated/80 animate-pulse" />
      <div className="h-8 w-56 rounded-xl bg-surface-elevated/90 animate-pulse" />
    </div>

    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <GlassCard variant="glass" padding="lg" className="lg:col-span-7 space-y-3">
        <div className="h-5 w-40 rounded-lg bg-surface-elevated/80 animate-pulse" />
        <div className="h-24 w-full rounded-xl bg-surface-elevated/60 animate-pulse" />
        <div className="h-16 w-full rounded-xl bg-surface-elevated/50 animate-pulse" />
      </GlassCard>

      <GlassCard variant="matte" padding="lg" className="lg:col-span-5 space-y-3">
        <div className="h-5 w-36 rounded-lg bg-surface-elevated/80 animate-pulse" />
        <div className="h-20 w-full rounded-xl bg-surface-elevated/60 animate-pulse" />
        <div className="h-12 w-full rounded-xl bg-surface-elevated/50 animate-pulse" />
      </GlassCard>
    </div>
  </div>
);
