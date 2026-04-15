import { Skeleton } from "@/components/ui/Skeleton";

export default function StudioFinanceLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        ))}
      </div>

      {/* Revenue chart */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-24 rounded-xl" />
        </div>
        <Skeleton className="h-[200px] rounded-xl" />
      </div>

      {/* By master table */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-36" />
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
