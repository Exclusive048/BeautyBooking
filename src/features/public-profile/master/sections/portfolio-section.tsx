import { PortfolioStrip } from "@/features/public-profile/master/portfolio-strip";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { serverApiFetch } from "@/lib/api/server-fetch";

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

export async function PortfolioSection({ providerId }: Props) {
  let items: PortfolioItemPreview[] = [];
  let hasError = false;

  try {
    items = await fetchPortfolio(providerId);
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-portfolio", error, [
      `/api/feed/portfolio?masterId=${encodeURIComponent(providerId)}&limit=8`,
    ]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <PortfolioStrip items={items} />
    </div>
  );
}
