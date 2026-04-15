import { Skeleton } from "@/components/ui/Skeleton";

export default function StudioAnalyticsLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-9 w-40 rounded-xl" />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-4 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-20" />
          </div>
        ))}
      </div>

      {/* Main chart */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-[200px] rounded-xl" />
      </div>

      {/* Two charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-[150px] rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
