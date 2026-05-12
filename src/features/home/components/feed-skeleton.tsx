export function FeedSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-border-subtle/60 bg-bg-card">
      <div className="aspect-[4/5] w-full animate-pulse bg-bg-input/60" />
      <div className="space-y-2 p-3 sm:p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-bg-input/60" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-bg-input/60" />
        <div className="h-3.5 w-1/3 animate-pulse rounded bg-bg-input/60" />
      </div>
    </div>
  );
}

type GridSkeletonProps = {
  count: number;
};

export function FeedSkeletonGrid({ count }: GridSkeletonProps) {
  return (
    <div className="grid grid-cols-2 gap-3 px-3 sm:gap-4 sm:px-0 md:grid-cols-3 md:gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <FeedSkeleton key={i} />
      ))}
    </div>
  );
}
