import { Skeleton } from "@/components/ui/Skeleton";

export default function StudioLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-40 rounded-2xl" />
      <Skeleton className="h-32 rounded-2xl" />
    </div>
  );
}
