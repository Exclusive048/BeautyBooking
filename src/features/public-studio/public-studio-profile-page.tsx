import { Suspense } from "react";
import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";
import { HeroSkeleton } from "@/components/blocks/skeletons/HeroSkeleton";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ReviewsSkeleton } from "@/components/blocks/skeletons/ReviewsSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import { StudioHeroSection } from "@/features/public-studio/sections/hero-section";
import { StudioBookingSection } from "@/features/public-studio/sections/booking-section";
import { StudioDetailsSection } from "@/features/public-studio/sections/details-section";
import { StudioPhotosSection } from "@/features/public-studio/sections/photos-section";
import { StudioReviewsSection } from "@/features/public-studio/sections/reviews-section";
import { StudioServicesSection } from "@/features/public-studio/sections/services-section";
import { StudioTeamSection } from "@/features/public-studio/sections/team-section";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
  bookingParams?: { master?: string; masterId?: string; serviceId?: string; slotStartAt?: string };
};

export function PublicStudioProfilePage({ studioId, bookingParams }: Props) {
  return (
    <div className="space-y-8">
      <Suspense fallback={<HeroSkeleton />}>
        <StudioHeroSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<BookingSkeleton />}>
        <StudioBookingSection studioId={studioId} bookingParams={bookingParams} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioDetailsSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<PortfolioSkeleton />}>
        <StudioPhotosSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        <StudioReviewsSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioServicesSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioTeamSection studioId={studioId} />
      </Suspense>

      <a
        href="#studio-booking-entry"
        className="fixed bottom-5 right-5 z-20 inline-flex items-center justify-center rounded-full border border-border-subtle bg-gradient-to-r from-primary via-primary-hover to-primary-magenta px-5 py-3 text-sm font-semibold text-[rgb(var(--accent-foreground))] shadow-hover transition hover:brightness-105"
      >
        {UI_TEXT.publicStudio.heroBook}
      </a>
    </div>
  );
}
