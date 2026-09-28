import React from 'react';

export function CardSkeleton() {
  return (
    <div className="bhumi-card animate-pulse" aria-hidden="true">
      <div className="skeleton h-4 w-32 mb-3 rounded" />
      <div className="skeleton h-3 w-24 mb-6 rounded" />
      <div className="grid grid-cols-3 gap-3 flex-1">
        <div className="skeleton rounded-xl h-24" />
        <div className="skeleton rounded-xl h-24" />
        <div className="skeleton rounded-xl h-24" />
      </div>
    </div>
  );
}

export function MapSkeleton() {
  return (
    <div
      className="map-area skeleton flex items-center justify-center"
      style={{ background: 'var(--surface-tile)' }}
      aria-hidden="true"
      aria-label="Loading map"
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        className="opacity-30"
        aria-hidden="true"
      >
        <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
        <path
          d="M12 20 Q18 14 24 20 Q30 26 36 20"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
        <path
          d="M12 28 Q18 22 24 28 Q30 34 36 28"
          stroke="currentColor"
          strokeWidth="2"
          fill="none"
        />
      </svg>
    </div>
  );
}

export function TileSkeleton() {
  return (
    <div className="stat-tile skeleton" aria-hidden="true">
      <div className="skeleton h-8 w-16 rounded mb-1" style={{ background: '#CBD9D6' }} />
      <div className="skeleton h-3 w-20 rounded" style={{ background: '#CBD9D6' }} />
    </div>
  );
}

interface EmptyStateProps {
  message: string;
  action?: React.ReactNode;
}

export function EmptyState({ message, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[120px] text-[var(--ink-muted)]">
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
        <circle cx="20" cy="20" r="3" fill="currentColor" />
      </svg>
      <p className="text-sm text-center max-w-[200px]">{message}</p>
      {action}
    </div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[120px]">
      <svg
        width="40"
        height="40"
        viewBox="0 0 40 40"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="20" cy="20" r="18" stroke="var(--destructive)" strokeWidth="1.5" />
        <line x1="20" y1="12" x2="20" y2="23" stroke="var(--destructive)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="28" r="1.5" fill="var(--destructive)" />
      </svg>
      <p className="text-sm text-center max-w-[220px] text-[var(--ink-muted)]">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-sm font-medium text-[var(--ink)] underline underline-offset-2 hover:no-underline"
          type="button"
        >
          {retryLabel}
        </button>
      )}
    </div>
  );
}
