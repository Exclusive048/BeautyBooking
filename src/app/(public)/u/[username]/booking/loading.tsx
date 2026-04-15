import { Skeleton } from "@/components/ui/Skeleton";

export default function BookingLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      {/* Service name */}
      <Skeleton className="h-7 w-56" />

      {/* Stepper dots */}
      <div className="flex items-center gap-0">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="flex flex-1 items-center">
            <Skeleton className="h-7 w-7 rounded-full" />
            {i < 3 && <Skeleton className="mx-1 h-px flex-1" />}
          </div>
        ))}
      </div>

      {/* Step content card */}
      <Skeleton className="h-72 rounded-[20px]" />

      {/* Navigation buttons */}
      <div className="flex justify-between">
        <Skeleton className="h-9 w-24 rounded-xl" />
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
    </div>
  );
}
