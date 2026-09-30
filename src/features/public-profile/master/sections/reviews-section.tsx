import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import {
  REVIEWS_PREVIEW_LIMIT,
  reviewsProbeLimit,
} from "@/features/public-profile/master/reviews-constants";
import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { ReviewsSectionClient } from "@/features/public-profile/master/sections/reviews-section-client";
import { isAiFeaturesEnabled } from "@/lib/env";
import { emptyOnRefusal } from "@/features/public-profile/master/server/refusal";
import { getViewer } from "@/features/public-profile/master/server/viewer";
import type { ReviewDto } from "@/lib/reviews/types";
import * as UI_TEXT from "@/lib/ui/text";
import { findReviewableBookingId, listReviews } from "@/lib/reviews/service";

type Props = {
  providerId: string;
};

/**
 * REVIEWS-LOADMORE-01: fetch the preview page **plus one probe row**, so the
 * client knows whether «Показать больше отзывов» should render at all without
 * a click that loads nothing. The probe row is dropped here, never rendered.
 */
async function fetchReviews(
  providerId: string,
  viewer: Awaited<ReturnType<typeof getViewer>>,
): Promise<{ reviews: ReviewDto[]; hasMore: boolean }> {
  const batch = await emptyOnRefusal<ReviewDto[]>(
    () =>
      listReviews({
        targetType: "provider",
        targetId: providerId,
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

export async function ReviewsSection({ providerId }: Props) {
  let provider = null;
  let reviews: ReviewDto[] = [];
  let hasMoreReviews = false;
  let canReviewBookingId: string | null = null;
  let hasError = false;
  let currentUserId: string | null = null;

  try {
    const [providerResult, sessionUser] = await Promise.all([
      getProvider(providerId),
      getViewer(),
    ]);
    provider = providerResult;
    currentUserId = sessionUser?.id ?? null;
    if (provider) {
      // Гостю запись для отзыва не ищется вовсе (раньше — запрос с ответом 401).
      const result = await Promise.all([
        fetchReviews(provider.id, sessionUser),
        currentUserId
          ? findReviewableBookingId({ currentUserId, providerId: provider.id })
          : Promise.resolve(null),
      ]);
      reviews = result[0].reviews;
      hasMoreReviews = result[0].hasMore;
      canReviewBookingId = result[1];
    }
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-reviews", error, ["getProviderProfile", "listReviews", "findReviewableBookingId"]);
  }

  if (hasError) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.blockLoadFailed}
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        {UI_TEXT.publicProfile.page.reviewsLoadFailed}
      </div>
    );
  }

  // fix-03: AI summary button only renders when the feature flag is
  // on. Sync env check — `getAiFeaturesEnabled()` (which also reads
  // the SystemConfig override) would add a DB round-trip per public
  // profile request. The runtime override is admin-flippable and
  // rarely toggled mid-session; env is the right signal here.
  return (
    <div className="fade-in-up">
      <ReviewsSectionClient
        providerId={provider.id}
        initialRating={provider.rating}
        initialReviewsCount={provider.reviews}
        initialReviews={reviews}
        initialHasMore={hasMoreReviews}
        canReviewBookingId={canReviewBookingId}
        currentUserId={currentUserId}
        aiSummaryEnabled={isAiFeaturesEnabled}
      />
    </div>
  );
}
