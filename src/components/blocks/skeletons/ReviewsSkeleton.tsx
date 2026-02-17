import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/Skeleton";

export function ReviewsSkeleton() {
  return (
    <Card>
      <CardContent className="p-5 md:p-6">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-28" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>
        <div className="mt-4 space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={`review-skeleton-${index}`}
              className="rounded-2xl border border-border-subtle bg-bg-input/70 p-3"
            >
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="mt-2 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
