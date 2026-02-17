import { HeroBlock } from "@/features/public-profile/master/hero-block";
import { getProvider } from "@/features/public-profile/master/server/provider-query";
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

async function fetchCoverUrl(providerId: string): Promise<string | null> {
  const res = await fetch(
    `/api/feed/portfolio?masterId=${encodeURIComponent(providerId)}&limit=1`,
    { cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as ApiResponse<{
    items: PortfolioItemPreview[];
  }> | null;
  if (!res.ok || !json || !json.ok) return null;
  return json.data.items?.[0]?.mediaUrl ?? null;
}

export async function HeroSection({ providerId }: Props) {
  let provider = null;
  let coverUrl: string | null = null;
  let hasError = false;

  try {
    const result = await Promise.all([
      getProvider(providerId),
      fetchCoverUrl(providerId),
    ]);
    provider = result[0];
    coverUrl = result[1];
  } catch {
    hasError = true;
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить профиль.
      </div>
    );
  }

  return (
    <div className="fade-in-up">
      <HeroBlock
        provider={provider}
        coverUrl={coverUrl}
        specialization={provider.tagline.trim() ? provider.tagline : null}
      />
    </div>
  );
}
