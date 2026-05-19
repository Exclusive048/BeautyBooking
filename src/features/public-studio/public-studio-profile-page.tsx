import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { BookingSkeleton } from "@/components/blocks/skeletons/BookingSkeleton";
import { HeroSkeleton } from "@/components/blocks/skeletons/HeroSkeleton";
import { PortfolioSkeleton } from "@/components/blocks/skeletons/PortfolioSkeleton";
import { ReviewsSkeleton } from "@/components/blocks/skeletons/ReviewsSkeleton";
import { ServicesSkeleton } from "@/components/blocks/skeletons/ServicesSkeleton";
import { StudioHeroSection } from "@/features/public-studio/sections/hero-section";
import { StudioDetailsSection } from "@/features/public-studio/sections/details-section";
import { StudioPhotosSection } from "@/features/public-studio/sections/photos-section";
import { StudioReviewsSection } from "@/features/public-studio/sections/reviews-section";
import { StudioServicesSection } from "@/features/public-studio/sections/services-section";
import { StudioSlotBarSection } from "@/features/public-studio/sections/slot-bar-section";
import { StudioTeamSection } from "@/features/public-studio/sections/team-section";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
  // Kept on the prop interface for backwards-compat with route handlers
  // that still pass `?serviceId=` / `?master=` — those now flow straight
  // through to the booking widget (`/u/[username]/booking`) via the
  // hero/slot-bar/sticky CTA deep links instead of opening an inline
  // booking flow on this page.
  bookingParams?: { master?: string; masterId?: string; serviceId?: string; slotStartAt?: string };
};

/**
 * STUDIO-PUBLIC-PROFILE-A — public studio profile shell.
 *
 * What changed vs the legacy version:
 *   - Dropped the inline `<StudioBookingSection>` (full booking flow
 *     embedded on the profile). Per spec, booking is now strictly a
 *     deep link to `/u/[username]/booking` — the dedicated widget owns
 *     that surface, the profile stays a marketing page.
 *   - Added `<StudioSlotBarSection>` — accent CTA bar above services
 *     (audit-driven: no studio-scope slot aggregator exists, so the
 *     bar ships without a live counter; backlog item tracks it).
 *   - Reordered sections per spec: hero → slot bar → services → team →
 *     photos → reviews → contacts (was: hero → booking → details →
 *     photos → reviews → services → team).
 *
 * Performance posture (cross-ref audit on `/u/[username]`):
 *   - Each section is its own Suspense boundary with a real skeleton
 *     fallback (no `null` fallbacks). Heavy queries (photos, reviews)
 *     stream independently.
 *   - Sections internally use `Promise.all` for parallel data fetch
 *     (verified in hero-section.tsx). No new sequential awaits added.
 *
 * Out of scope (backlog):
 *   - Owner toolbar / inline ProfileEditor — STUDIO-SETTINGS-A owns
 *     the studio's edit surface, no duplicate UI on the public page.
 *   - Page view + conversion analytics — no tracking infrastructure today.
 *   - FAQ section + history/values/philosophy — fields don't exist in
 *     the schema; description carries the long-form copy for now.
 *   - "Написать в студию" pre-booking chat — auth model blocks this
 *     (STUDIO-GAPS-FIX-A precedent).
 */
export function PublicStudioProfilePage({ studioId }: Props) {
  return (
    <div className="space-y-6 lg:space-y-8">
      <Suspense fallback={<HeroSkeleton />}>
        <StudioHeroSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<BookingSkeleton />}>
        <StudioSlotBarSection studioId={studioId} />
      </Suspense>

      <Suspense fallback={<ServicesSkeleton />}>
        <StudioServicesSection studioId={studioId} />
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

      <Button
        asChild
        className="fixed bottom-5 right-5 z-20 rounded-full px-5 py-3 shadow-hover"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Link href="#studio-services">{UI_TEXT.publicStudio.heroBook}</Link>
      </Button>
    </div>
  );
}
