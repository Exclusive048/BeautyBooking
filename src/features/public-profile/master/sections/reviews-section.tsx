import { cookies } from "next/headers";
import { logPublicBlockError } from "@/features/public-profile/master/server/block-error";
import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { ReviewsSectionClient } from "@/features/public-profile/master/sections/reviews-section-client";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ClientBooking } from "@/lib/bookings/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import { UI_TEXT } from "@/lib/ui/text";
import { getSessionUser } from "@/lib/auth/session";

type Props = {
  providerId: string;
};

async function fetchReviews(providerId: string): Promise<ReviewDto[]> {
  const path = `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}&limit=3&offset=0`;
  const json = await serverApiFetch<{ reviews: ReviewDto[] }>(path);
  if (!json.ok) return [];
  return json.data.reviews ?? [];
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
      reviews = result[0];
      canReviewBookingId = result[1];
    }
  } catch (error) {
    hasError = true;
    logPublicBlockError("master-reviews", error, [
      `/api/providers/${providerId}`,
      `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}&limit=3&offset=0`,
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

  return (
    <div className="fade-in-up">
      <ReviewsSectionClient
        providerId={provider.id}
        initialRating={provider.rating}
        initialReviewsCount={provider.reviews}
        initialReviews={reviews}
        canReviewBookingId={canReviewBookingId}
        currentUserId={currentUserId}
      />
    </div>
  );
}
