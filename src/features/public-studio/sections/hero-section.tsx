import { StudioHeroGallery } from "@/features/public-studio/studio-hero-gallery";
import {
  getStudioPortfolio,
  getStudioProfile,
} from "@/features/public-studio/server/studio-query";
import { isViewerProfileOwner } from "@/features/public-profile/master/server/owner-view";
import type { MediaAssetDto } from "@/lib/media/types";
import { studioBookingUrl } from "@/lib/public-urls";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioHeroSection({ studioId }: Props) {
  let studio = null;
  let portfolio: MediaAssetDto[] = [];
  // FIX-STUDIO-02 (owner parity): hide the hero booking CTA for the owner
  // (self-booking is server-rejected). Cached helper, resolves in parallel.
  let isOwner = false;
  let hasError = false;

  try {
    const result = await Promise.all([
      getStudioProfile(studioId),
      getStudioPortfolio(studioId),
      isViewerProfileOwner(studioId),
    ]);
    studio = result[0];
    portfolio = result[1];
    isOwner = result[2];
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("hero-section", error, ["getProviderProfile", "listMediaAssets"]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
        {UI_TEXT.publicStudio.blockLoadFailed}
      </div>
    );
  }

  if (!studio) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card p-5 text-sm text-text-sec">
        {UI_TEXT.publicStudio.profileLoadFailed}
      </div>
    );
  }

  const portfolioItems = portfolio.map((item) => ({
    url: item.url,
  }));
  const bannerItem = studio.bannerUrl
    ? { url: studio.bannerUrl, crop: studio.bannerCrop }
    : null;
  const imageItems = bannerItem
    ? [bannerItem, ...portfolioItems.filter((item) => item.url !== studio.bannerUrl)]
    : portfolioItems;

  const bookingHref = studioBookingUrl(
    { id: studio.id, publicUsername: studio.publicUsername },
    undefined,
    "public-studio-hero"
  ) ?? "#";

  return (
    <div className="fade-in-up">
      <StudioHeroGallery
        studio={studio}
        imageItems={imageItems}
        bookingHref={bookingHref}
        hideBooking={isOwner}
      />
    </div>
  );
}
