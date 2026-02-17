import { Skeleton } from "@/components/ui/Skeleton";

export function HeroSkeleton() {
  return (
    <section className="overflow-hidden rounded-[32px] border border-border-subtle/70 bg-bg-card shadow-hover">
      <div className="relative h-[280px] md:h-[340px]">
        <Skeleton className="h-full w-full rounded-none" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 md:px-6 md:pb-6">
          <div className="rounded-2xl bg-black/10 p-4 md:p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div className="flex items-end gap-4">
                <Skeleton className="h-[120px] w-[120px] rounded-full" />
                <div className="space-y-2 pb-1">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </div>
              <Skeleton className="h-10 w-44 rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
