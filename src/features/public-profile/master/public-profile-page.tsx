import { Suspense } from "react";
import { SelectedServicesProvider } from "@/features/public-profile/master/selected-services-context";
import { HeroSection } from "@/features/public-profile/master/sections/hero-section";
import { ServicesSection } from "@/features/public-profile/master/sections/services-section";
import { PortfolioSection } from "@/features/public-profile/master/sections/portfolio-section";
import { ReviewsSection } from "@/features/public-profile/master/sections/reviews-section";
import { BookingSection } from "@/features/public-profile/master/sections/booking-section";
import { HeroSkeleton } from "@/components/blocks/skeletons/HeroSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ReviewsSkeleton } from "@/components/blocks/skeletons/ReviewsSkeleton";
import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";

type Props = {
  providerId: string;
  initialServiceId: string | null;
  initialSlotStartAt: string | null;
};

export function PublicMasterProfilePage({
  providerId,
  initialServiceId,
  initialSlotStartAt,
}: Props) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<HeroSkeleton />}>
        <HeroSection providerId={providerId} />
      </Suspense>

      <SelectedServicesProvider>
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <Suspense fallback={<ServicesSkeleton />}>
              <ServicesSection providerId={providerId} initialServiceId={initialServiceId} />
            </Suspense>

            <Suspense fallback={<PortfolioSkeleton />}>
              <PortfolioSection providerId={providerId} />
            </Suspense>

            <Suspense fallback={<ReviewsSkeleton />}>
              <ReviewsSection providerId={providerId} />
            </Suspense>
          </div>

          <div className="h-fit lg:sticky lg:top-6 lg:max-h-[calc(100dvh-7rem)] lg:overflow-auto">
            <Suspense fallback={<BookingSkeleton />}>
              <BookingSection providerId={providerId} initialSlotStartAt={initialSlotStartAt} />
            </Suspense>
          </div>
        </div>
      </SelectedServicesProvider>
    </div>
  );
}
