import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";
import { HeroSkeleton } from "@/components/blocks/skeletons/HeroSkeleton";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ReviewsSkeleton } from "@/components/blocks/skeletons/ReviewsSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";

export default function PublicProfileLoading() {
  return (
    <div className="space-y-6">
      <HeroSkeleton />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <div className="space-y-4">
          <ServicesSkeleton />
          <PortfolioSkeleton />
          <ReviewsSkeleton />
        </div>
        <div className="h-fit">
          <BookingSkeleton />
        </div>
      </div>
    </div>
  );
}
