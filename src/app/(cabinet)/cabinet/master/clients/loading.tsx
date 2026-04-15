import { Skeleton } from "@/components/ui/Skeleton";

export default function MasterClientsLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>

      {/* Search */}
      <Skeleton className="h-10 w-full rounded-xl" />

      {/* Client rows */}
      {[...Array(6)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-bg-card px-5 py-4">
          <Skeleton className="h-10 w-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
