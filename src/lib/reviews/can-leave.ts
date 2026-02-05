import type { BookingStatus } from "@prisma/client";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import { REVIEW_GRACE_MINUTES, REVIEW_WINDOW_DAYS } from "@/lib/reviews/constants";

type BookingForReviewCheck = {
  clientUserId: string | null;
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  service: { durationMin: number } | null;
};

function resolveDurationMinutes(booking: BookingForReviewCheck): number {
  if (booking.startAtUtc && booking.endAtUtc && booking.endAtUtc > booking.startAtUtc) {
    return Math.round((booking.endAtUtc.getTime() - booking.startAtUtc.getTime()) / 60000);
  }
  return booking.service?.durationMin ?? 0;
}

export function canLeaveReview(input: {
  booking: BookingForReviewCheck;
  currentUserId: string;
  nowUtc: Date;
}): boolean {
  const { booking, currentUserId, nowUtc } = input;
  if (!booking.clientUserId || booking.clientUserId !== currentUserId) return false;
  if (!booking.startAtUtc) return false;

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
    now: nowUtc,
  });
  if (runtimeStatus !== "FINISHED") return false;

  const durationMinutes = resolveDurationMinutes(booking);
  if (durationMinutes <= 0) return false;

  const finishedAt = new Date(
    booking.startAtUtc.getTime() + (durationMinutes + REVIEW_GRACE_MINUTES) * 60 * 1000
  );
  const deadline = new Date(
    finishedAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000
  );

  return nowUtc >= finishedAt && nowUtc <= deadline;
}
