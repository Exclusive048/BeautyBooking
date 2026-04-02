import { Suspense } from "react";
import { HeroSection } from "@/features/public-profile/master/sections/hero-section";
import { ServicesSection } from "@/features/public-profile/master/sections/services-section";
import { PortfolioSection } from "@/features/public-profile/master/sections/portfolio-section";
import { ReviewsSection } from "@/features/public-profile/master/sections/reviews-section";
import { BookingSection } from "@/features/public-profile/master/sections/booking-section";
import { SectionNav } from "@/features/public-profile/master/section-nav";
import { MobileBookingCta } from "@/features/public-profile/master/mobile-booking-cta";
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
    <>
      <div className="space-y-4 pb-20 lg:pb-0">
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection providerId={providerId} />
        </Suspense>

        <SectionNav />

        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <div id="services">
              <Suspense fallback={<ServicesSkeleton />}>
                <ServicesSection providerId={providerId} initialServiceId={initialServiceId} />
              </Suspense>
            </div>

            <div id="portfolio">
              <Suspense fallback={<PortfolioSkeleton />}>
                <PortfolioSection providerId={providerId} />
              </Suspense>
            </div>

            <div id="reviews">
              <Suspense fallback={<ReviewsSkeleton />}>
                <ReviewsSection providerId={providerId} />
              </Suspense>
            </div>
          </div>

          <div id="booking" className="h-fit lg:sticky lg:top-16 lg:max-h-[calc(100dvh-7rem)] lg:overflow-auto">
            <Suspense fallback={<BookingSkeleton />}>
              <BookingSection providerId={providerId} initialSlotStartAt={initialSlotStartAt} />
            </Suspense>
          </div>
        </div>
      </div>

      <MobileBookingCta />
    </>
  );
}
