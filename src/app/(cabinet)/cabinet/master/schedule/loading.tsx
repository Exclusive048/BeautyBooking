import { Skeleton } from "@/components/ui/Skeleton";

export default function MasterScheduleLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-9 w-32 rounded-xl" />
      </div>

      {/* Week navigation */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-8 rounded-lg" />
        <Skeleton className="h-5 w-48 flex-1" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-1">
        {[...Array(7)].map((_, i) => (
          <Skeleton key={i} className="h-8 rounded-lg" />
        ))}
        {[...Array(35)].map((_, i) => (
          <Skeleton key={`cell-${i}`} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* Time blocks */}
      <div className="space-y-2">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
