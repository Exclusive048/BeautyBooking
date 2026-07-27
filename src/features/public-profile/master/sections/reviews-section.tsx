import { cookies } from "next/headers";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import {
  REVIEWS_PREVIEW_LIMIT,
  reviewsProbeLimit,
} from "@/features/public-profile/master/reviews-constants";
import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { ReviewsSectionClient } from "@/features/public-profile/master/sections/reviews-section-client";
import { isAiFeaturesEnabled } from "@/lib/env";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ClientBooking } from "@/lib/bookings/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import { UI_TEXT } from "@/lib/ui/text";
import { getSessionUser } from "@/lib/auth/session";

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
): Promise<{ reviews: ReviewDto[]; hasMore: boolean }> {
  const path =
    `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}` +
    `&limit=${reviewsProbeLimit(REVIEWS_PREVIEW_LIMIT)}&offset=0`;
  const json = await serverApiFetch<{ reviews: ReviewDto[] }>(path);
  if (!json.ok) return { reviews: [], hasMore: false };
  const batch = json.data.reviews ?? [];
  return {
    reviews: batch.slice(0, REVIEWS_PREVIEW_LIMIT),
    hasMore: batch.length > REVIEWS_PREVIEW_LIMIT,
  };
}

async function buildCookieHeader(): Promise<string | null> {
  const store = await cookies();
  const entries = store.getAll();
  if (!entries.length) return null;
  const header = entries.map(({ name, value }) => `${name}=${value}`).join("; ");
  return header || null;
}

async function fetchCanReviewBookingId(providerId: string): Promise<string | null> {
  const cookieHeader = await buildCookieHeader();
  const headers = cookieHeader ? { cookie: cookieHeader } : undefined;

  const bookingsJson = await serverApiFetch<{ bookings: ClientBooking[] }>(
    "/api/me/bookings",
    headers ? { headers } : undefined
  );
  if (!bookingsJson.ok) return null;

  const ownBookings = bookingsJson.data.bookings.filter((booking) => booking.provider.id === providerId);
  for (const booking of ownBookings) {
    const canLeaveJson = await serverApiFetch<{ canLeave: boolean }>(
      `/api/reviews/can-leave?bookingId=${encodeURIComponent(booking.id)}`,
      headers ? { headers } : undefined
    );
    if (canLeaveJson.ok && canLeaveJson.data.canLeave) {
      return booking.id;
    }
  }

  return null;
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
      getSessionUser(),
    ]);
    provider = providerResult;
    currentUserId = sessionUser?.id ?? null;
    if (provider) {
      const result = await Promise.all([
        fetchReviews(provider.id),
        fetchCanReviewBookingId(provider.id),
      ]);
      reviews = result[0].reviews;
      hasMoreReviews = result[0].hasMore;
      canReviewBookingId = result[1];
    }
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-reviews", error, [
      `/api/providers/${providerId}`,
      `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}&limit=${reviewsProbeLimit(REVIEWS_PREVIEW_LIMIT)}&offset=0`,
      "/api/me/bookings",
    ]);
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
