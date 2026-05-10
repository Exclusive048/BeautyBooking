import { Suspense } from "react";
import { HeroSection } from "@/features/public-profile/master/sections/hero-section";
import { ServicesSection } from "@/features/public-profile/master/sections/services-section";
import { PortfolioSection } from "@/features/public-profile/master/sections/portfolio-section";
import { ReviewsSection } from "@/features/public-profile/master/sections/reviews-section";
import { AboutSection } from "@/features/public-profile/master/sections/about-section";
import { MapSection } from "@/features/public-profile/master/sections/map-section";
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

/**
 * Public master profile (32a). Page rhythm:
 *   hero · sticky tabs · two-column grid
 *
 * Left column scrolls through services / portfolio / reviews / about
 * (each anchored by `id` so SectionNav can highlight the active one
 * via IntersectionObserver). Right column hosts the sticky booking
 * widget on lg+. On mobile the booking widget collapses into a
 * fixed bottom drawer via <MobileBookingCta />.
 *
 * Sections use a shared cached aggregator (`getMasterPublicProfileView`)
 * so all sections de-duplicate to a single Prisma roundtrip per
 * request, while keeping their own Suspense boundaries for graceful
 * partial loads.
 */
export function PublicMasterProfilePage({
  providerId,
  initialServiceId,
  initialSlotStartAt,
}: Props) {
  return (
    <>
      <div className="space-y-5 pb-24 lg:pb-0">
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection providerId={providerId} />
        </Suspense>

        <SectionNav />

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-8">
            <div id="services" className="scroll-mt-24">
              <Suspense fallback={<ServicesSkeleton />}>
                <ServicesSection
                  providerId={providerId}
                  initialServiceId={initialServiceId}
                />
              </Suspense>
            </div>

            <div id="portfolio" className="scroll-mt-24">
              <Suspense fallback={<PortfolioSkeleton />}>
                <PortfolioSection providerId={providerId} />
              </Suspense>
            </div>

            <div id="reviews" className="scroll-mt-24">
              <Suspense fallback={<ReviewsSkeleton />}>
                <ReviewsSection providerId={providerId} />
              </Suspense>
            </div>

            <div id="about" className="scroll-mt-24">
              <Suspense
                fallback={
                  <div className="h-32 animate-pulse rounded-2xl bg-bg-card/60" />
                }
              >
                <AboutSection providerId={providerId} />
              </Suspense>
            </div>

            <Suspense
              fallback={
                <div className="h-56 animate-pulse rounded-2xl bg-bg-card/60" />
              }
            >
              <MapSection providerId={providerId} />
            </Suspense>
          </div>

          <div
            id="booking"
            className="h-fit lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:overflow-auto"
          >
            <Suspense fallback={<BookingSkeleton />}>
              <BookingSection
                providerId={providerId}
                initialSlotStartAt={initialSlotStartAt}
              />
            </Suspense>
          </div>
        </div>
      </div>

      <MobileBookingCta />
    </>
  );
}
