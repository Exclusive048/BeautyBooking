import { Suspense } from "react";
import { HotSlotsPageClient } from "@/features/hot-slots/hot-slots-page-client";

export function HotSlotsPage() {
  return (
    <Suspense fallback={null}>
      <HotSlotsPageClient />
    </Suspense>
  );
}
