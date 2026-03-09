import { Suspense } from "react";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import { getVisualSearchEnabled } from "@/lib/visual-search/config";
import CatalogPageClient from "./catalog-page-client";

export async function CatalogPage() {
  const visualSearchEnabled = await getVisualSearchEnabled();

  return (
    <Suspense fallback={<ServicesSkeleton />}>
      <CatalogPageClient visualSearchEnabled={visualSearchEnabled} />
    </Suspense>
  );
}
