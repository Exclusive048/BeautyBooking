import { ResilientImage } from "@/components/ui/resilient-image";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import type { MediaAssetDto } from "@/lib/media/types";
import * as UI_TEXT from "@/lib/ui/text";
import {
  getStudioPortfolio,
} from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";

type Props = {
  studioId: string;
};

export async function StudioPhotosSection({ studioId }: Props) {
  let portfolio: MediaAssetDto[] = [];
  let hasError = false;

  try {
    portfolio = await getStudioPortfolio(studioId);
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("photos-section", error, ["listMediaAssets"]);
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
                ? portfolio.map((asset, index) => (
                    <div key={asset.id} className="relative aspect-square overflow-hidden rounded-2xl border border-border-subtle bg-bg-input">
                      <ResilientImage
                        src={asset.url}
                        alt={UI_TEXT.publicStudio.photoAltTemplate.replace("{n}", String(index + 1))}
                        sizes="(max-width: 768px) 50vw, 25vw"
                        className="object-cover"
                      />
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
