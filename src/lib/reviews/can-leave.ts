import type { BookingStatus } from "@prisma/client";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";
import { REVIEW_GRACE_MINUTES, REVIEW_WINDOW_DAYS } from "@/lib/reviews/constants";

// AUDIT (review eligibility constraints)
// - only FINISHED + 3-day window: IMPLEMENTED server-side.
// - booking ownership check (review author must be booking client): IMPLEMENTED.
// - product rule semantics already match requirements.

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

/**
 * The review window for a booking: `finishedAt` (start + duration + grace) and
 * the `deadline` (finishedAt + REVIEW_WINDOW_DAYS). Returns null when the
 * booking can never be reviewed by status/shape (terminal status, no start, no
 * duration). now-independent — eligibility is `now ∈ [finishedAt, deadline]`.
 * Shared so every surface (bookings DTO button, reviews page list, sidebar
 * count, server can-leave gate) computes the SAME window — no divergent numbers.
 */
export function reviewWindowFor(
  booking: BookingForReviewCheck,
): { finishedAt: Date; deadline: Date } | null {
  if (!booking.startAtUtc) return null;
  // resolveBookingRuntimeStatus returns FINISHED for any non-terminal status
  // once now ≥ finishedAt; REJECTED/CANCELLED/NO_SHOW never become FINISHED.
  const runtimeIfPast = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
    now: new Date(8640000000000000), // far future → reveals "would it finish?"
  });
  if (runtimeIfPast !== "FINISHED") return null;

  const durationMinutes = resolveDurationMinutes(booking);
  if (durationMinutes <= 0) return null;

  const finishedAt = new Date(
    booking.startAtUtc.getTime() + (durationMinutes + REVIEW_GRACE_MINUTES) * 60 * 1000,
  );
  const deadline = new Date(finishedAt.getTime() + REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return { finishedAt, deadline };
}

export function canLeaveReview(input: {
  booking: BookingForReviewCheck;
  currentUserId: string;
  nowUtc: Date;
}): boolean {
  const { booking, currentUserId, nowUtc } = input;
  if (!booking.clientUserId || booking.clientUserId !== currentUserId) return false;

  const window = reviewWindowFor(booking);
  if (!window) return false;

  return nowUtc >= window.finishedAt && nowUtc <= window.deadline;
}
