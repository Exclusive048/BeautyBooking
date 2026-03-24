import { StudioHeroGallery } from "@/features/public-studio/studio-hero-gallery";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import type { MediaAssetDto } from "@/lib/media/types";
import { studioBookingUrl } from "@/lib/public-urls";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

async function fetchStudioPortfolio(studioId: string): Promise<MediaAssetDto[]> {
  const path = `/api/media?entityType=STUDIO&entityId=${encodeURIComponent(studioId)}&kind=PORTFOLIO`;
  const json = await serverApiFetch<{ assets: MediaAssetDto[] }>(path);
  if (!json.ok) return [];
  return json.data.assets ?? [];
}

export async function StudioHeroSection({ studioId }: Props) {
  let studio = null;
  let portfolio: MediaAssetDto[] = [];
  let hasError = false;

  try {
    const result = await Promise.all([
      getStudioProfile(studioId),
      fetchStudioPortfolio(studioId),
    ]);
    studio = result[0];
    portfolio = result[1];
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("hero-section", error, [
      `/api/providers/${studioId}`,
      `/api/media?entityType=STUDIO&entityId=${encodeURIComponent(studioId)}&kind=PORTFOLIO`,
    ]);
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
    focalX: item.focalX ?? null,
    focalY: item.focalY ?? null,
  }));
  const bannerItem = studio.bannerUrl
    ? { url: studio.bannerUrl, focalX: studio.bannerFocalX ?? null, focalY: studio.bannerFocalY ?? null }
    : null;
  const imageItems = bannerItem
    ? [bannerItem, ...portfolioItems.filter((item) => item.url !== studio.bannerUrl)]
    : portfolioItems;

  const bookingHref = studioBookingUrl(
    { id: studio.id, publicUsername: studio.publicUsername },
    undefined,
    "public-studio-hero"
  );

  return (
    <div className="fade-in-up">
      <StudioHeroGallery studio={studio} imageItems={imageItems} bookingHref={bookingHref} />
    </div>
  );
}
