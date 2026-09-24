export default function BookingLoading() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-4">
        {/* Hero band */}
        <div className="overflow-hidden rounded-2xl border border-border-subtle bg-bg-card">
          <div className="aspect-[16/9] animate-pulse bg-muted/60 sm:aspect-auto sm:h-60" />
          <div className="flex gap-4 p-5">
            <div className="-mt-14 h-20 w-20 animate-pulse rounded-2xl border-4 border-bg-card bg-muted/60" />
            <div className="flex-1 space-y-2">
              <div className="h-3 w-24 animate-pulse rounded bg-muted/60" />
              <div className="h-6 w-48 animate-pulse rounded bg-muted/60" />
              <div className="h-3 w-64 animate-pulse rounded bg-muted/40" />
            </div>
          </div>
        </div>
        {/* Stepper */}
        <div className="flex gap-2 rounded-xl border border-border-subtle bg-bg-card p-2.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-1 items-center gap-2.5 px-2 py-1">
              <div className="h-7 w-7 animate-pulse rounded-lg bg-muted/60" />
              <div className="space-y-1">
                <div className="h-2 w-12 animate-pulse rounded bg-muted/40" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted/50" />
              </div>
            </div>
          ))}
        </div>
        {/* Step body */}
        <div className="rounded-2xl border border-border-subtle bg-bg-card p-6">
          <div className="space-y-3">
            <div className="h-5 w-56 animate-pulse rounded bg-muted/60" />
            <div className="h-3 w-72 animate-pulse rounded bg-muted/40" />
            <div className="h-10 w-full animate-pulse rounded-xl bg-muted/40" />
            <div className="grid gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={idx} className="h-16 animate-pulse rounded-xl bg-muted/40" />
              ))}
            </div>
          </div>
        </div>
      </div>
      {/* Summary skeleton */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 lg:sticky lg:top-24 lg:self-start">
        <div className="h-5 w-32 animate-pulse rounded-full bg-muted/40" />
        <div className="mt-3 h-6 w-40 animate-pulse rounded bg-muted/60" />
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="flex items-center justify-between">
              <div className="h-3 w-16 animate-pulse rounded bg-muted/40" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted/40" />
            </div>
          ))}
        </div>
        <div className="mt-5 h-11 w-full animate-pulse rounded-xl bg-muted/60" />
      </div>
    </div>
  );
}
