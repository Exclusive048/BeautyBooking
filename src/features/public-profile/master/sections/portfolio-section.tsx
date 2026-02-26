import { PortfolioStrip } from "@/features/public-profile/master/portfolio-strip";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { MediaAssetDto } from "@/lib/media/types";

type PortfolioItemPreview = {
  id: string;
  mediaUrl: string;
  caption: string | null;
  primaryServiceTitle: string | null;
  masterName: string;
};

type Props = {
  providerId: string;
};

async function fetchPortfolio(providerId: string): Promise<PortfolioItemPreview[]> {
  const path = `/api/feed/portfolio?masterId=${encodeURIComponent(providerId)}&limit=8`;
  const json = await serverApiFetch<{ items: PortfolioItemPreview[] }>(path);
  if (!json.ok) return [];
  return json.data.items ?? [];
}

async function fetchPortfolioAssets(providerId: string): Promise<MediaAssetDto[]> {
  const path = `/api/media?entityType=MASTER&entityId=${encodeURIComponent(providerId)}&kind=PORTFOLIO`;
  const json = await serverApiFetch<{ assets: MediaAssetDto[] }>(path);
  if (!json.ok) return [];
  return json.data.assets ?? [];
}

export async function PortfolioSection({ providerId }: Props) {
  let items: PortfolioItemPreview[] = [];
  let assets: MediaAssetDto[] = [];
  let hasError = false;

  try {
    const [portfolioItems, portfolioAssets] = await Promise.all([
      fetchPortfolio(providerId),
      fetchPortfolioAssets(providerId),
    ]);
    items = portfolioItems;
    assets = portfolioAssets;
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-portfolio", error, [
      `/api/feed/portfolio?masterId=${encodeURIComponent(providerId)}&limit=8`,
      `/api/media?entityType=MASTER&entityId=${encodeURIComponent(providerId)}&kind=PORTFOLIO`,
    ]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }

  const visualIndexByAssetId: Record<string, { visualIndexed: boolean; visualCategory: string | null }> =
    {};
  for (const asset of assets) {
    visualIndexByAssetId[asset.id] = {
      visualIndexed: asset.visualIndexed,
      visualCategory: asset.visualCategory ?? null,
    };
  }

  return (
    <div className="fade-in-up">
      <PortfolioStrip items={items} visualIndexByAssetId={visualIndexByAssetId} />
    </div>
  );
}
