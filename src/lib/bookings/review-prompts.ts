import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadBookingWithRelations, notifyBookingCompletedReview } from "@/lib/notifications/booking-notifications";
import { logError } from "@/lib/logging/logger";

export async function runBookingReviewPromptJob(now = new Date()): Promise<void> {
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const candidates = await prisma.booking.findMany({
    where: {
      status: "CONFIRMED",
      endAtUtc: { gte: windowStart, lte: now },
      clientUserId: { not: null },
      review: { is: null },
    },
    select: { id: true },
    take: 200,
  });
  if (candidates.length === 0) return;

  const bookingIds = candidates.map((item) => item.id);
  const alreadyNotified = await prisma.notification.findMany({
    where: {
      bookingId: { in: bookingIds },
      type: NotificationType.BOOKING_COMPLETED_REVIEW,
    },
    select: { bookingId: true },
  });
  const notifiedSet = new Set(alreadyNotified.map((item) => item.bookingId).filter(Boolean));

  for (const item of candidates) {
    if (notifiedSet.has(item.id)) continue;
    try {
      const booking = await loadBookingWithRelations(item.id);
      if (!booking) continue;
      await notifyBookingCompletedReview(booking);
    } catch (error) {
      logError("Booking review prompt failed", {
        bookingId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
