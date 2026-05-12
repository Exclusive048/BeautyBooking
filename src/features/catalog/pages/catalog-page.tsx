import { Suspense } from "react";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import { getSessionUserId } from "@/lib/auth/session";
import { getFavoriteProviderIds } from "@/lib/favorites/get-favorites";
import { getVisualSearchEnabled } from "@/lib/visual-search/config";
import CatalogPageClient from "./catalog-page-client";

export async function CatalogPage() {
  const [visualSearchEnabled, userId] = await Promise.all([
    getVisualSearchEnabled(),
    getSessionUserId(),
  ]);
  // Server-resolve heart state once per request so the orchestrator hands
  // each card a deterministic `initialFavorited`. Anonymous visitors get an
  // empty list — the toggle endpoint also enforces auth on writes.
  const favoriteIds = userId ? Array.from(await getFavoriteProviderIds(userId)) : [];

  return (
    <Suspense fallback={<ServicesSkeleton />}>
      <CatalogPageClient
        visualSearchEnabled={visualSearchEnabled}
        isAuthenticated={Boolean(userId)}
        favoriteIds={favoriteIds}
      />
    </Suspense>
  );
}
