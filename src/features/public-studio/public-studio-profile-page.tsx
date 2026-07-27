import { Suspense } from "react";
import { HeroSkeleton } from "@/components/blocks/skeletons/HeroSkeleton";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ReviewsSkeleton } from "@/components/blocks/skeletons/ReviewsSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import { StudioHeroSection } from "@/features/public-studio/sections/hero-section";
import { StudioDetailsSection } from "@/features/public-studio/sections/details-section";
import { StudioPhotosSection } from "@/features/public-studio/sections/photos-section";
import { StudioPackagesSection } from "@/features/public-studio/sections/packages-section";
import { StudioReviewsSection } from "@/features/public-studio/sections/reviews-section";
import { StudioServicesSection } from "@/features/public-studio/sections/services-section";
import { StudioTeamSection } from "@/features/public-studio/sections/team-section";
import { StudioOwnerNotice } from "@/features/public-studio/sections/owner-notice-section";
import { StudioStickyCta } from "@/features/public-studio/sections/sticky-cta-section";

type Props = {
  studioId: string;
  // Kept on the prop interface for backwards-compat with route handlers
  // that still pass `?serviceId=` / `?master=` — those now flow straight
  // through to the booking widget (`/u/[username]/booking`) via the
  // hero/sticky CTA deep links instead of opening an inline booking flow
  // on this page.
  bookingParams?: { master?: string; masterId?: string; serviceId?: string; slotStartAt?: string };
};

/**
 * STUDIO-PUBLIC-PROFILE-A — public studio profile shell.
 *
 * Booking is strictly a deep link to `/u/[username]/booking` — the dedicated
 * widget owns that surface, the profile stays a marketing page.
 *
 * FIX-STUDIO-02 (known-open 1 — STUDIO-PROFILE-TRIPLE-BOOKING-CTA): the page
 * used to expose THREE top-level booking CTAs — the hero «Записаться онлайн»
 * (→ /booking), the slot-bar «Записаться» (→ /booking, a duplicate), and a
 * floating «Записаться онлайн» that only scrolled to `#studio-services` (a
 * book-labelled anchor that doesn't book). Now: the hero CTA is the single
 * primary /booking entry; the redundant slot-bar section is removed; the
 * floating affordance is an honest «К услугам» scroll (`StudioStickyCta`).
 * Contextual CTAs (per-service, per-master, package) are legitimate and stay.
 *
 * FIX-STUDIO-02 (owner parity — SELF-BOOKING-STUDIO-OWNER-PARITY): when the
 * viewer owns this studio the self-booking guard rejects them at submit, so
 * every booking CTA is a dead end. Each section suppresses its booking CTAs for
 * the owner and `StudioOwnerNotice` shows the «это ваш профиль» card instead;
 * the sticky is hidden. The server-side guard stays as defense in depth.
 *
 * Performance posture: each section is its own Suspense boundary with a real
 * skeleton fallback; heavy queries stream independently. Ownership is resolved
 * per-section via the cached `isViewerProfileOwner` (one query/request).
 */
export function PublicStudioProfilePage({ studioId }: Props) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <Suspense fallback={<HeroSkeleton />}>
        <StudioHeroSection studioId={studioId} />
      </Suspense>

      {/* Owner-only notice; a normal viewer sees nothing here (hero → services). */}
      <Suspense fallback={null}>
        <StudioOwnerNotice studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioServicesSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioPackagesSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioTeamSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<PortfolioSkeleton />}>
        <StudioPhotosSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ReviewsSkeleton />}>
        <StudioReviewsSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioDetailsSection studioId={studioId} />
      </Suspense>

      {/* Honest «К услугам» scroll (was a book-labelled anchor); hidden for owner. */}
      <Suspense fallback={null}>
        <StudioStickyCta studioId={studioId} />
      </Suspense>
    </div>
  );
}
