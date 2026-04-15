import { Skeleton } from "@/components/ui/Skeleton";

export default function StudioTeamLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-9 w-36 rounded-xl" />
      </div>

      {/* Team members */}
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-2xl border border-border-subtle bg-bg-card px-5 py-4">
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-36" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      ))}

      {/* Pending invites */}
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 space-y-3">
        <Skeleton className="h-5 w-36" />
        {[...Array(2)].map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
