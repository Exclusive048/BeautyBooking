import { Skeleton } from "@/components/ui/Skeleton";

export function ServicesSkeleton() {
  return (
    <section className="lux-card rounded-[28px] p-5">
      <Skeleton className="h-6 w-40" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={`service-skeleton-${index}`}
            className="rounded-2xl border border-border-subtle bg-bg-input/70 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-32" />
              </div>
              <Skeleton className="h-8 w-28 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
