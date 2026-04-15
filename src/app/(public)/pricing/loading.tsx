import { Skeleton } from "@/components/ui/Skeleton";

export default function PricingLoading() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 space-y-10 sm:px-6">
      {/* Hero */}
      <div className="text-center space-y-3">
        <Skeleton className="mx-auto h-9 w-56" />
        <Skeleton className="mx-auto h-5 w-80" />
      </div>

      {/* Period toggle */}
      <div className="flex justify-center">
        <Skeleton className="h-10 w-56 rounded-full" />
      </div>

      {/* Plan cards */}
      <div className="grid gap-6 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="rounded-2xl border border-border-subtle bg-bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-8 w-32" />
            <div className="space-y-2 pt-2">
              {[...Array(5)].map((_, j) => (
                <Skeleton key={j} className="h-4 w-full" />
              ))}
            </div>
            <Skeleton className="h-10 w-full rounded-xl" />
          </div>
        ))}
      </div>

      {/* Feature comparison table */}
      <div className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="flex gap-4">
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
