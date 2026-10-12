import { Suspense } from "react";
import { HeroSection } from "@/features/public-profile/master/sections/hero-section";
import { ServicesSection } from "@/features/public-profile/master/sections/services-section";
import { PortfolioSection } from "@/features/public-profile/master/sections/portfolio-section";
import { ReviewsSection } from "@/features/public-profile/master/sections/reviews-section";
import { AboutSection } from "@/features/public-profile/master/sections/about-section";
import { MapSection } from "@/features/public-profile/master/sections/map-section";
import { BookingSection } from "@/features/public-profile/master/sections/booking-section";
import { OwnerProfileNotice } from "@/features/public-profile/master/sections/owner-profile-notice";
import { SectionNav } from "@/features/public-profile/master/section-nav";
import {
  MasterBookingProvider,
  MasterFloatingBooking,
} from "@/features/public-profile/master/booking-dialog-context";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
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
 * card on lg+.
 *
 * BOOKING-WIDGET-DIALOG: запись — окно по шагам (`MasterBookingDialog`).
 * Его открывают «Записаться» у услуги (с этой услугой), карточка записи и
 * плавающая кнопка на телефоне (`MasterFloatingBooking`).
 *
 * Sections use a shared cached aggregator (`getMasterPublicProfileView`)
 * so all sections de-duplicate to a single Prisma roundtrip per
 * request, while keeping their own Suspense boundaries for graceful
 * partial loads.
 *
 * Owner view (FIX-MASTER-01 item 5): when the viewer owns this profile the
 * booking card, the service «Записаться» buttons and the floating CTA are
 * replaced with an owner notice — self-booking is server-rejected anyway, so the affordance was a
 * guaranteed dead end.
 */
export async function PublicMasterProfilePage({
  providerId,
  initialServiceId,
  initialSlotStartAt,
}: Props) {
  const isOwner = await isViewerProfileOwner(providerId);
  return (
    <MasterBookingProvider>
      {/* `pb-24`: последняя секция не уходит под плавающую «Записаться»; у
          владельца кнопки нет — и места под неё тоже. */}
      <div className={isOwner ? "space-y-5" : "space-y-5 pb-24 lg:pb-0"}>
        <Suspense fallback={<HeroSkeleton />}>
          <HeroSection providerId={providerId} />
        </Suspense>

        <SectionNav />

        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0 space-y-8">
            <div id="services" className="scroll-mt-24">
              <Suspense fallback={<ServicesSkeleton />}>
                <ServicesSection providerId={providerId} />
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

          {/* Запись идёт в окне, здесь только короткая карточка — без своей
              прокрутки, иначе обёртка срезала её тень. */}
          <div id="booking" className="h-fit lg:sticky lg:top-20">
            {isOwner ? (
              <OwnerProfileNotice />
            ) : (
              <Suspense fallback={<BookingSkeleton />}>
                <BookingSection
                  providerId={providerId}
                  initialServiceId={initialServiceId}
                  initialSlotStartAt={initialSlotStartAt}
                />
              </Suspense>
            )}
          </div>
        </div>
      </div>

      {isOwner ? null : <MasterFloatingBooking />}
    </MasterBookingProvider>
  );
}
