import React from 'react';
import { cn } from '../../utils/cn';
import { EditorialUnderline } from './EditorialOrnaments';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  illustration?: React.ReactNode;
  action?: EmptyStateAction | React.ReactNode;
  showUnderline?: boolean;
  compact?: boolean;
  className?: string;
}

function isActionObject(action: EmptyStateProps['action']): action is EmptyStateAction {
  return (
    typeof action === 'object' &&
    action !== null &&
    !React.isValidElement(action) &&
    'label' in action &&
    'onClick' in action
  );
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  illustration,
  action,
  showUnderline = false,
  compact = false,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'px-4 py-7' : 'px-5 py-12',
        className
      )}
    >
      {illustration && (
        <div className="mb-3.5 flex items-center justify-center" aria-hidden="true">
          {illustration}
        </div>
      )}

      <h3 className="font-serif text-[18px] font-medium leading-[1.35] tracking-[-0.01em] text-ink">
        {title}
      </h3>

      {showUnderline && <EditorialUnderline width={76} className="mt-2" />}

      {description && (
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-secondary">
          {description}
        </p>
      )}

      {action && (
        <div className="mt-4">
          {isActionObject(action) ? (
            <button
              type="button"
              onClick={action.onClick}
              className="inline-flex min-h-[38px] items-center justify-center gap-2 rounded-xl border border-amber/35 bg-amber-soft px-4 py-2 text-xs font-semibold text-amber-fg transition-colors duration-150 hover:border-amber/60 hover:bg-amber/20 active:scale-[0.97]"
            >
              {action.icon && <span className="shrink-0" aria-hidden="true">{action.icon}</span>}
              <span>{action.label}</span>
            </button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
};
