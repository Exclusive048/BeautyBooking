import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import * as UI_TEXT from "@/lib/ui/text";
import { getStudioPagePhotos } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { StudioPhotosGrid, type StudioPhoto } from "@/features/public-studio/components/studio-photos-grid";

type Props = {
  studioId: string;
};

export async function StudioPhotosSection({ studioId }: Props) {
  let photos: StudioPhoto[] = [];
  let hasError = false;

  try {
    // Правило подписей и вырезов — общее с каруселью в шапке (`getStudioPagePhotos`).
    photos = (await getStudioPagePhotos(studioId)).map(({ url, alt, caption }) => ({ url, alt, caption }));
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("photos-section", error, ["listMediaAssets", "getProviderProfile"]);
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
            {photos.length > 0 ? (
              <StudioPhotosGrid photos={photos} />
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[4/5] rounded-2xl border border-border-subtle bg-bg-input" />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
