import { Skeleton } from "@/components/ui/Skeleton";

export default function MasterReviewsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Rating summary */}
      <div className="flex items-center gap-6 rounded-2xl border border-border-subtle bg-bg-card p-5">
        <Skeleton className="h-16 w-16 rounded-2xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>

      {/* Review cards */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}
