import { cookies } from "next/headers";
import { getProvider } from "@/features/public-profile/master/server/provider-query";
import { ReviewsSectionClient } from "@/features/public-profile/master/sections/reviews-section-client";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";

type ClientBooking = {
  id: string;
  provider: { id: string };
};

type Props = {
  providerId: string;
};

async function fetchReviews(providerId: string): Promise<ReviewDto[]> {
  const res = await fetch(
    `/api/reviews?targetType=provider&targetId=${encodeURIComponent(providerId)}&limit=3&offset=0`,
    { cache: "no-store" }
  );
  const json = (await res.json().catch(() => null)) as ApiResponse<{ reviews: ReviewDto[] }> | null;
  if (!res.ok || !json || !json.ok) return [];
  return json.data.reviews ?? [];
}

async function fetchCanReviewBookingId(providerId: string): Promise<string | null> {
  const cookie = cookies().toString();
  const headers = cookie ? { cookie } : undefined;

  const bookingsRes = await fetch("/api/me/bookings", { cache: "no-store", headers });
  const bookingsJson = (await bookingsRes.json().catch(() => null)) as ApiResponse<{
    bookings: ClientBooking[];
  }> | null;
  if (!bookingsRes.ok || !bookingsJson || !bookingsJson.ok) return null;

  const ownBookings = bookingsJson.data.bookings.filter((booking) => booking.provider.id === providerId);
  for (const booking of ownBookings) {
    const canLeaveRes = await fetch(
      `/api/reviews/can-leave?bookingId=${encodeURIComponent(booking.id)}`,
      { cache: "no-store", headers }
    );
    const canLeaveJson = (await canLeaveRes.json().catch(() => null)) as ApiResponse<{ canLeave: boolean }> | null;
    if (canLeaveRes.ok && canLeaveJson && canLeaveJson.ok && canLeaveJson.data.canLeave) {
      return booking.id;
    }
  }

  return null;
}

export async function ReviewsSection({ providerId }: Props) {
  try {
    const provider = await getProvider(providerId);
    if (!provider) {
      return (
        <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
          Не удалось загрузить отзывы.
        </div>
      );
    }

    const [reviews, canReviewBookingId] = await Promise.all([
      fetchReviews(provider.id),
      fetchCanReviewBookingId(provider.id),
    ]);

    return (
      <div className="fade-in-up">
        <ReviewsSectionClient
          providerId={provider.id}
          initialRating={provider.rating}
          initialReviewsCount={provider.reviews}
          initialReviews={reviews}
          canReviewBookingId={canReviewBookingId}
        />
      </div>
    );
  } catch {
    return (
      <div className="rounded-2xl border border-border-subtle bg-bg-card/90 p-5 text-sm text-text-sec">
        Не удалось загрузить блок.
      </div>
    );
  }
}
