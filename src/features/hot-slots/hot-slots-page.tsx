import { Suspense } from "react";
import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";
import { HotSlotsPageClient } from "@/features/hot-slots/hot-slots-page-client";

export function HotSlotsPage() {
  return (
    <Suspense fallback={<BookingSkeleton />}>
      <HotSlotsPageClient />
    </Suspense>
  );
}
