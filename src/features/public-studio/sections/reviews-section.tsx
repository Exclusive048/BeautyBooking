import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { StudioReviewsSectionClient } from "@/features/public-studio/sections/reviews-section-client";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import type { ClientBooking } from "@/lib/bookings/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import type { ApiResponse } from "@/lib/types/api";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

async function fetchReviews(studioId: string): Promise<ReviewDto[]> {
  const res = await fetch(
    `/api/reviews?targetType=studio&targetId=${encodeURIComponent(studioId)}&limit=3&offset=0`,
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

export async function StudioReviewsSection({ studioId }: Props) {
  let studio = null;
  let reviews: ReviewDto[] = [];
  let canReviewBookingId: string | null = null;
  let hasError = false;

  try {
    studio = await getStudioProfile(studioId);
    if (studio) {
      const result = await Promise.all([
        fetchReviews(studio.id),
        fetchCanReviewBookingId(studio.id),
      ]);
      reviews = result[0];
      canReviewBookingId = result[1];
    }
  } catch {
    hasError = true;
  }

  if (hasError) {
    return (
      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="text-sm text-text-muted">Не удалось загрузить блок.</div>
          </CardContent>
        </Card>
      </Section>
    );
  }

  if (!studio) {
    return (
      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <div className="text-sm text-text-muted">Не удалось загрузить отзывы.</div>
          </CardContent>
        </Card>
      </Section>
    );
  }

  return (
    <div className="fade-in-up">
      <Section title={UI_TEXT.publicStudio.sectionReviews} subtitle={UI_TEXT.publicStudio.sectionReviewsSubtitle}>
        <Card className="bg-surface">
          <CardContent className="p-5 md:p-6">
            <StudioReviewsSectionClient
              studioId={studio.id}
              initialRating={studio.rating}
              initialReviewsCount={studio.reviews}
              initialReviews={reviews}
              canReviewBookingId={canReviewBookingId}
            />
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
