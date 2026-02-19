import { StudioHeroGallery } from "@/features/public-studio/studio-hero-gallery";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ApiResponse } from "@/lib/types/api";
import { studioBookingUrl } from "@/lib/public-urls";

type Props = {
  studioId: string;
};

async function fetchStudioPortfolio(studioId: string): Promise<MediaAssetDto[]> {
  const res = await fetch(
    `/api/media?entityType=STUDIO&entityId=${encodeURIComponent(studioId)}&kind=PORTFOLIO`,
    { cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as ApiResponse<{ assets: MediaAssetDto[] }> | null;
  if (!res.ok || !json || !json.ok) return [];
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
    console.error("[public-studio] hero-section failed", { studioId, error });
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
