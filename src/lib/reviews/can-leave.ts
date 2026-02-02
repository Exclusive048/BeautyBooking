import type { BookingStatus } from "@prisma/client";
import { REVIEW_GRACE_MINUTES } from "@/lib/reviews/constants";

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
  if (booking.status === "CANCELLED") return false;
  if (!booking.startAtUtc) return false;

  const durationMinutes = resolveDurationMinutes(booking);
  if (durationMinutes <= 0) return false;

  const eligibleAt = new Date(
    booking.startAtUtc.getTime() + (durationMinutes + REVIEW_GRACE_MINUTES) * 60 * 1000
  );
  return nowUtc >= eligibleAt;
}

