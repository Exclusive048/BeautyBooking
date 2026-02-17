/* eslint-disable @next/next/no-img-element */
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import type { MediaAssetDto } from "@/lib/media/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

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

export async function StudioPhotosSection({ studioId }: Props) {
  try {
    const portfolio = await fetchStudioPortfolio(studioId);
    return (
      <div className="fade-in-up">
        <Section title={UI_TEXT.publicStudio.sectionPhotos} subtitle={UI_TEXT.publicStudio.sectionPhotosSubtitle}>
          <Card className="bg-surface">
            <CardContent className="p-5 md:p-6">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {portfolio.length > 0
                  ? portfolio.map((asset) => (
                      <div key={asset.id} className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
                        <img src={asset.url} alt="" className="h-full w-full object-cover" />
                      </div>
                    ))
                  : Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-square rounded-2xl border border-border bg-muted" />
                    ))}
              </div>
            </CardContent>
          </Card>
        </Section>
      </div>
    );
  } catch {
    return (
      <Section title={UI_TEXT.publicStudio.sectionPhotos} subtitle={UI_TEXT.publicStudio.sectionPhotosSubtitle}>
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="text-sm text-text-muted">Не удалось загрузить блок.</div>
          </CardContent>
        </Card>
      </Section>
    );
  }
}
