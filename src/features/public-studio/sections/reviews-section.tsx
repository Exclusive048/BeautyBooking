import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { StudioReviewsSectionClient } from "@/features/public-studio/sections/reviews-section-client";
import {
  REVIEWS_PREVIEW_LIMIT,
  reviewsProbeLimit,
} from "@/features/public-profile/master/reviews-constants";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { emptyOnRefusal } from "@/features/public-profile/master/server/refusal";
import { getViewer } from "@/features/public-profile/master/server/viewer";
import { findReviewableBookingId, listReviews } from "@/lib/reviews/service";
import type { ReviewDto } from "@/lib/reviews/types";
import * as UI_TEXT from "@/lib/ui/text";

type Props = {
  studioId: string;
};

/**
 * STUDIO-REVIEWS-NO-LOADMORE: те же размеры и та же n+1-проба, что у мастера
 * (`reviews-constants.ts`): лишняя строка — только сигнал «есть ещё», в выдачу
 * она не попадает. Счётчик `Provider.reviews` на этот вопрос не отвечает.
 */
async function fetchReviews(
  studioId: string,
  viewer: Awaited<ReturnType<typeof getViewer>>,
): Promise<{ reviews: ReviewDto[]; hasMore: boolean }> {
  const batch = await emptyOnRefusal<ReviewDto[]>(
    () =>
      listReviews({
        targetType: "studio",
        targetId: studioId,
        limit: reviewsProbeLimit(REVIEWS_PREVIEW_LIMIT),
        offset: 0,
        currentUser: viewer,
      }),
    [],
  );
  return {
    reviews: batch.slice(0, REVIEWS_PREVIEW_LIMIT),
    hasMore: batch.length > REVIEWS_PREVIEW_LIMIT,
  };
}

export async function StudioReviewsSection({ studioId }: Props) {
  let studio = null;
  let reviews: ReviewDto[] = [];
  let hasMoreReviews = false;
  let canReviewBookingId: string | null = null;
  let hasError = false;

  try {
    const [studioResult, sessionUser] = await Promise.all([
      getStudioProfile(studioId),
      getViewer(),
    ]);
    studio = studioResult;
    if (studio) {
      // Гостю запись для отзыва не ищется вовсе (раньше — запрос с ответом 401).
      const result = await Promise.all([
        fetchReviews(studio.id, sessionUser),
        sessionUser
          ? findReviewableBookingId({ currentUserId: sessionUser.id, providerId: studio.id })
          : Promise.resolve(null),
      ]);
      reviews = result[0].reviews;
      hasMoreReviews = result[0].hasMore;
      canReviewBookingId = result[1];
    }
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("reviews-section", error, ["getProviderProfile", "listReviews", "findReviewableBookingId"]);
  }

  if (hasError) {
    return (
      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-bg-card">
          <CardContent className="p-5 md:p-6">
            <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.blockLoadFailed}</div>
          </CardContent>
        </Card>
      </Section>
    );
  }

  if (!studio) {
    return (
      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-bg-card">
          <CardContent className="p-5 md:p-6">
            <div className="text-sm text-text-muted">{UI_TEXT.publicStudio.reviewsLoadFailed}</div>
          </CardContent>
        </Card>
      </Section>
    );
  }

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-bg-card">
          <CardContent className="p-5 md:p-6">
            <StudioReviewsSectionClient
              studioId={studio.id}
              initialRating={studio.rating}
              initialReviewsCount={studio.reviews}
              initialReviews={reviews}
              initialHasMore={hasMoreReviews}
              canReviewBookingId={canReviewBookingId}
            />
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
