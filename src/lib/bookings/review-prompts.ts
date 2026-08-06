import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadBookingsWithRelations, notifyBookingCompletedReview } from "@/lib/notifications/booking-notifications";
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

  // PERF-26: снапшоты грузятся одним запросом на весь проход, а не поштучно
  // внутри цикла. Прежняя форма стоила `findUnique` + рассылка на КАЖДОГО
  // кандидата, то есть до 400 последовательных round-trip'ов при `take: 200`.
  // Сама рассылка остаётся последовательной и по-прежнему изолирована
  // try/catch на элемент: она шлёт push и пишет уведомление, и падение одного
  // получателя не должно ни останавливать проход, ни ускоряться за счёт
  // параллельной нагрузки на push-канал.
  const pendingIds = candidates.map((item) => item.id).filter((id) => !notifiedSet.has(id));
  const bookings = await loadBookingsWithRelations(pendingIds);

  for (const id of pendingIds) {
    try {
      const booking = bookings.get(id);
      if (!booking) continue;
      await notifyBookingCompletedReview(booking);
    } catch (error) {
      logError("Booking review prompt failed", {
        bookingId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
