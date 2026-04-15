import { Skeleton } from "@/components/ui/Skeleton";

export default function StudioServicesLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Service groups */}
      {[...Array(2)].map((_, gi) => (
        <div key={gi} className="space-y-2">
          <Skeleton className="h-5 w-32" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-bg-card px-5 py-4">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-44" />
                <div className="flex gap-3">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-6 w-10 rounded-full" />
              <Skeleton className="h-8 w-8 rounded-lg" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
