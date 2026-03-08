import { Suspense } from "react";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import InspirationFeedClient from "./inspiration-feed-client";

export function InspirationFeedPage() {
  return (
    <Suspense fallback={<PortfolioSkeleton />}>
      <InspirationFeedClient />
    </Suspense>
  );
}
