import { StudioHeroGallery } from "@/features/public-studio/studio-hero-gallery";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import type { MediaAssetDto } from "@/lib/media/types";
import { studioBookingUrl } from "@/lib/public-urls";
import { serverApiFetch } from "@/lib/api/server-fetch";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";

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
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
        Не удалось загрузить блок.
      </div>
    );
  }

  if (!studio) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
        Не удалось загрузить профиль студии.
      </div>
    );
  }

  const imageUrls = studio.bannerUrl
    ? [studio.bannerUrl, ...portfolio.map((item) => item.url).filter((url) => url !== studio.bannerUrl)]
    : portfolio.map((item) => item.url);

  const bookingHref = studioBookingUrl(
    { id: studio.id, publicUsername: studio.publicUsername },
    undefined,
    "public-studio-hero"
  );

  return (
    <div className="fade-in-up">
      <StudioHeroGallery studio={studio} imageUrls={imageUrls} bookingHref={bookingHref} />
    </div>
  );
}
