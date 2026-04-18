import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import type { MediaAssetDto } from "@/lib/media/types";
import { UI_TEXT } from "@/lib/ui/text";
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

export async function StudioPhotosSection({ studioId }: Props) {
  let portfolio: MediaAssetDto[] = [];
  let hasError = false;

  try {
    portfolio = await fetchStudioPortfolio(studioId);
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("photos-section", error, [
      `/api/media?entityType=STUDIO&entityId=${encodeURIComponent(studioId)}&kind=PORTFOLIO`,
    ]);
  }

  if (hasError) {
    return (
      <Section title={UI_TEXT.publicStudio.sectionPhotos} subtitle={UI_TEXT.publicStudio.sectionPhotosSubtitle}>
        <Card className="bg-bg-card">
          <CardContent className="p-5 md:p-6">
            <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.blockLoadFailed}</div>
          </CardContent>
        </Card>
      </Section>
    );
  }

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.sectionPhotos} subtitle={UI_TEXT.publicStudio.sectionPhotosSubtitle}>
        <Card className="bg-bg-card">
          <CardContent className="p-5 md:p-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {portfolio.length > 0
                ? portfolio.map((asset) => (
                    <div key={asset.id} className="relative aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
                      <Image src={asset.url} alt="" fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
                    </div>
                  ))
                : Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="aspect-square rounded-2xl border border-border-subtle bg-bg-input" />
                  ))}
            </div>
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
