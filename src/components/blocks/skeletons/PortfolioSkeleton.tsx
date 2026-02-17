import { Skeleton } from "@/components/ui/Skeleton";

export function PortfolioSkeleton() {
  return (
    <section className="lux-card rounded-[28px] p-5">
      <Skeleton className="h-6 w-44" />
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={`portfolio-skeleton-${index}`}
            className="aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-bg-input/70"
          >
            <Skeleton className="h-full w-full rounded-none" />
          </div>
        ))}
      </div>
    </section>
  );
}
