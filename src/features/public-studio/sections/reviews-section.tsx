import { cookies } from "next/headers";
import { Card, CardContent } from "@/components/ui/card";
import { Section } from "@/components/ui/section";
import { StudioReviewsSectionClient } from "@/features/public-studio/sections/reviews-section-client";
import { getStudioProfile } from "@/features/public-studio/server/studio-query";
import { logPublicStudioBlockError } from "@/features/public-studio/server/block-error";
import { serverApiFetch } from "@/lib/api/server-fetch";
import type { ClientBooking } from "@/lib/bookings/dto";
import type { ReviewDto } from "@/lib/reviews/types";
import { UI_TEXT } from "@/lib/ui/text";

type Props = {
  studioId: string;
};

async function fetchReviews(studioId: string): Promise<ReviewDto[]> {
  const path = `/api/reviews?targetType=studio&targetId=${encodeURIComponent(studioId)}&limit=3&offset=0`;
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
  } catch (error) {
    hasError = true;
    logPublicStudioBlockError("reviews-section", error, [
      `/api/providers/${studioId}`,
      `/api/reviews?targetType=studio&targetId=${encodeURIComponent(studioId)}&limit=3&offset=0`,
      "/api/me/bookings",
    ]);
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
