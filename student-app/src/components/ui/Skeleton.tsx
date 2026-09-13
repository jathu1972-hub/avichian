export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} aria-hidden />;
}

export function FeedSkeleton() {
  return (
    <div className="mx-auto w-full max-w-xl space-y-4" aria-busy="true" aria-label="Loading feed">
      <div className="flex gap-3 overflow-hidden px-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center gap-2">
            <Skeleton className="h-16 w-16 rounded-full" />
            <Skeleton className="h-2.5 w-12 rounded-full" />
          </div>
        ))}
      </div>
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="premium-card overflow-hidden p-0">
          <div className="flex items-center gap-3 p-4">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-32 rounded-full" />
              <Skeleton className="h-2.5 w-24 rounded-full" />
            </div>
          </div>
          <Skeleton className="h-56 w-full rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-3 w-full rounded-full" />
            <Skeleton className="h-3 w-2/3 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
