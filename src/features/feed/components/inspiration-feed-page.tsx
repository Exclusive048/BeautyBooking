import { Suspense } from "react";
import InspirationFeedClient from "./inspiration-feed-client";

export function InspirationFeedPage() {
  return (
    <Suspense fallback={null}>
      <InspirationFeedClient />
    </Suspense>
  );
}
