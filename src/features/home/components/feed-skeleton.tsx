/** HOME-FEED-DENSE: сетка ленты — 3 в ряд на телефоне, 6 на ПК. Одна на ленту и скелетоны. */
export const FEED_GRID_CLASS = "grid grid-cols-3 gap-1.5 sm:gap-3 lg:grid-cols-6 lg:gap-4";

export function FeedSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border-subtle/60 bg-bg-card">
      <div className="aspect-[4/5] w-full animate-pulse bg-bg-input/60" />
      <div className="space-y-1.5 px-2 py-1.5 sm:px-2.5 sm:py-2">
        <div className="h-3 w-2/3 animate-pulse rounded bg-bg-input/60" />
        <div className="h-2.5 w-1/3 animate-pulse rounded bg-bg-input/60" />
      </div>
    </div>
  );
}

type GridSkeletonProps = {
  count: number;
};

export function FeedSkeletonGrid({ count }: GridSkeletonProps) {
  return (
    <div className={FEED_GRID_CLASS}>
      {Array.from({ length: count }).map((_, i) => (
        <FeedSkeleton key={i} />
      ))}
    </div>
  );
}
