import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";

export default function CatalogLoading() {
  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-4 pb-8 pt-4 sm:px-6 lg:px-8">
      <ServicesSkeleton />
      <PortfolioSkeleton />
    </div>
  );
}
