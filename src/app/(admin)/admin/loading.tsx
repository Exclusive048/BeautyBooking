import { Skeleton } from "@/components/ui/Skeleton";

export default function AdminLoading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-44" />

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-[180px] rounded-xl" />
      </div>

      {/* Recent activity */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-36" />
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
