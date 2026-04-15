import { Skeleton } from "@/components/ui/Skeleton";

export default function MasterAnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-40 rounded-xl" />
      </div>

      {/* Summary metrics */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-24" />
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[180px] rounded-xl" />
      </div>

      {/* Two columns */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-[140px] rounded-xl" />
        </div>
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-[140px] rounded-xl" />
        </div>
      </div>
    </div>
  );
}
