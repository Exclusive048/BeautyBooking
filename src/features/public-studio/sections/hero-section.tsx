import { StudioHeroGallery } from "@/features/public-studio/studio-hero-gallery";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ApiResponse } from "@/lib/types/api";

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
  try {
    const [studio, portfolio] = await Promise.all([
      getStudioProfile(studioId),
      fetchStudioPortfolio(studioId),
    ]);
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

    return (
      <div className="fade-in-up">
        <StudioHeroGallery studio={studio} imageUrls={imageUrls} />
      </div>
    );
  } catch {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5 text-sm text-text-muted">
        Не удалось загрузить блок.
      </div>
    );
  }
}
