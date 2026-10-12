import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { formatWorkCaption } from "@/lib/feed/work-caption";
import type { MediaAssetDto } from "@/lib/media/types";
import { getStudioPortfolioCaptions, type StudioPortfolioCaption } from "@/lib/studios/portfolio-items";
import * as UI_TEXT from "@/lib/ui/text";
import {
  getStudioPortfolio,
} from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { StudioPhotosGrid, type StudioPhoto } from "@/features/public-studio/components/studio-photos-grid";

/**
 * Подписи «мастер · услуга» — дополнение к фото: не прочитались — фото
 * показываются без них, а не «Не удалось загрузить блок».
 */
async function loadCaptions(studioId: string): Promise<Map<string, StudioPortfolioCaption>> {
  try {
    return await getStudioPortfolioCaptions(studioId);
  } catch (error) {
    logPublicStudioBlockError("photos-captions", error, ["getStudioPortfolioCaptions"]);
    return new Map();
  }
}

type Props = {
  studioId: string;
};

export async function StudioPhotosSection({ studioId }: Props) {
  let portfolio: MediaAssetDto[] = [];
  let captions = new Map<string, StudioPortfolioCaption>();
  let hasError = false;

  try {
    [portfolio, captions] = await Promise.all([getStudioPortfolio(studioId), loadCaptions(studioId)]);
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

  // Наружу — ссылка, подпись и alt; id файла клиенту не нужен (он и так в ссылке).
  const photos: StudioPhoto[] = portfolio.map((asset, index) => {
    const caption = captions.get(asset.id);
    return {
      url: asset.url,
      alt: UI_TEXT.publicStudio.photoAltTemplate.replace("{n}", String(index + 1)),
      caption: caption ? formatWorkCaption(caption.performerName, caption.subject) : null,
    };
  });

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.sectionPhotos} subtitle={UI_TEXT.publicStudio.sectionPhotosSubtitle}>
        <Card className="bg-bg-card">
          <CardContent className="p-5 md:p-6">
            {photos.length > 0 ? (
              <StudioPhotosGrid photos={photos} />
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-square rounded-2xl border border-border-subtle bg-bg-input" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
