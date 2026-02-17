import { PortfolioStrip } from "@/features/public-profile/master/portfolio-strip";
import type { ApiResponse } from "@/lib/types/api";

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
  const res = await fetch(
    `/api/feed/portfolio?masterId=${encodeURIComponent(providerId)}&limit=8`,
    { cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as ApiResponse<{
    items: PortfolioItemPreview[];
  }> | null;
  if (!res.ok || !json || !json.ok) return [];
  return json.data.items ?? [];
}

export async function PortfolioSection({ providerId }: Props) {
  try {
    const items = await fetchPortfolio(providerId);
    return (
      <div className="fade-in-up">
        <PortfolioStrip items={items} />
      </div>
    );
  } catch {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }
}
