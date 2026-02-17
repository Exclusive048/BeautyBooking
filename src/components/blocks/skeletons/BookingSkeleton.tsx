import { Skeleton } from "@/components/ui/Skeleton";

export function BookingSkeleton() {
  return (
    <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 shadow-card">
      <div className="space-y-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-10 w-full rounded-xl" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={`booking-skeleton-${index}`} className="h-10 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}
