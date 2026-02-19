/* eslint-disable @next/next/no-img-element */
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { moneyRUB } from "@/lib/format";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

export async function StudioDetailsSection({ studioId }: Props) {
  let studio = null;
  let hasError = false;

  try {
    studio = await getStudioProfile(studioId);
  } catch (error) {
    hasError = true;
    console.error("[public-studio] details-section failed", { studioId, error });
  }

  if (hasError) {
    return (
      <Card className="bg-surface">
        <CardContent className="p-5 md:p-6">
          <div className="text-sm text-text-muted">Не удалось загрузить блок.</div>
        </CardContent>
      </Card>
    );
  }

  if (!studio) {
    return (
      <Card className="bg-surface">
        <CardContent className="p-5 md:p-6">
          <div className="text-sm text-text-muted">Не удалось загрузить данные студии.</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="fade-in-up">
      <Card className="bg-surface">
        <CardContent className="space-y-4 p-5 md:p-6">
          {studio.avatarUrl ? (
            <img src={studio.avatarUrl} alt="" className="h-20 w-20 rounded-2xl object-cover" />
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{UI_TEXT.publicStudio.typeStudio}</Badge>
            {studio.availableToday ? <Badge>{UI_TEXT.publicStudio.availableToday}</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-text-muted">
              <span className="font-semibold text-text">{studio.rating.toFixed(1)}</span>{" "}
              <span>({studio.reviews} {UI_TEXT.publicStudio.reviewsCountLabel})</span>
            </div>
            <div className="text-sm text-text">
              {UI_TEXT.publicStudio.from} <span className="font-semibold">{moneyRUB(studio.priceFrom)}</span>
            </div>
          </div>
          <div className="text-sm text-text-muted">
            {studio.district} / {studio.address}
          </div>
          {studio.description ? <div className="text-sm text-text-muted">{studio.description}</div> : null}
          <div className="flex flex-wrap gap-2">
            {studio.categories.length ? (
              studio.categories.map((c) => <Badge key={c}>{c}</Badge>)
            ) : (
              <Badge>{UI_TEXT.publicStudio.noCategories}</Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
