import { Skeleton } from "@/components/ui/Skeleton";

export default function MasterDashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Page title */}
      <Skeleton className="h-7 w-40" />

      {/* Metric cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Advisor card */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>

      {/* Upcoming bookings */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
        <Skeleton className="h-5 w-36" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-8 w-20 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
