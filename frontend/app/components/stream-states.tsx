"use client";

// Shared loading / empty / error presentation for the stream list views.
// Keeps the founder + worker dashboards consistent and stops the "flash of
// empty state" while the first on-chain fetch is in flight: show skeletons,
// not "No streams yet", until we actually know the list is empty.

import { AlertTriangle, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

// One bar that pulses; pulse is suppressed under prefers-reduced-motion.
function Bar({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-surface-2 rounded-sm animate-pulse motion-reduce:animate-none ${className}`}
    />
  );
}

/** Skeleton matching a single stream card's layout, for layout stability. */
export function StreamCardSkeleton() {
  return (
    <div className="glass-plate rounded-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-2">
          <Bar className="h-5 w-40" />
          <Bar className="h-2.5 w-56" />
        </div>
        <Bar className="h-4 w-20" />
      </div>
      <Bar className="h-1.5 w-full mb-3" />
      <div className="flex gap-3">
        <Bar className="h-2.5 w-24" />
        <Bar className="h-2.5 w-24" />
      </div>
    </div>
  );
}

/** A column of stream-card skeletons. */
export function StreamListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4" aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <StreamCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** The four summary stat cards in skeleton form. */
export function StatCardsSkeleton() {
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10"
      aria-busy="true"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="glass-plate rounded-lg p-6">
          <Bar className="h-2.5 w-24 mb-4" />
          <Bar className="h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Empty state with optional call-to-action. */
export function StreamsEmpty({
  message,
  action,
}: {
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className="glass-plate rounded-lg p-12 text-center">
      <p className="font-mono text-sm text-on-surface-variant">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/** Error state with a retry action. */
export function StreamsError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="glass-plate rounded-lg p-12 text-center">
      <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-3" />
      <p className="font-mono text-sm text-on-surface-variant mb-1">
        Couldn&apos;t load streams
      </p>
      <p className="font-mono text-[10px] text-on-surface-variant/50 mb-5 break-words max-w-md mx-auto">
        {message}
      </p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 bg-mint text-black font-mono text-xs font-bold px-4 py-2 rounded-sm hover:brightness-110 active:scale-95 transition-all uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mint focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <RefreshCw className="w-3 h-3" />
        Retry
      </button>
    </div>
  );
}
