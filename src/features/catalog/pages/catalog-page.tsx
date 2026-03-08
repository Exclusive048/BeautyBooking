import { Suspense } from "react";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import CatalogPageClient from "./catalog-page-client";

export function CatalogPage() {
  return (
    <Suspense fallback={<ServicesSkeleton />}>
      <CatalogPageClient />
    </Suspense>
  );
}
