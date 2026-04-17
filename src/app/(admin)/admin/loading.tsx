import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      {/* Title + refresh */}
      <div className="flex items-start justify-between">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-24 rounded-xl" />
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
        <Skeleton className="h-4 w-36" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-4 py-2">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-20" />
            </div>
            <Skeleton className="h-3 w-14 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
}
