import { BookingStatus, NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadBookingsWithRelations, notifyBookingCompletedReview } from "@/lib/notifications/booking-notifications";
import { logError } from "@/lib/logging/logger";
import { REVIEW_GRACE_MINUTES } from "@/lib/reviews/constants";

/**
 * REVIEW-PROMPT-01 — кому и когда уходит «Оставьте отзыв».
 *
 * 🔴 Три дефекта прежней формы, каждый из которых сам по себе лишал визит
 * запроса отзыва:
 *   1. Запрос уходил сразу после `endAtUtc`, а отзыв открывается только через
 *      `REVIEW_GRACE_MINUTES` после конца (`reviews/can-leave.ts`). Клиент,
 *      нажавший сразу, попадал на запись без кнопки «Оставить отзыв», а
 *      повторного запроса не бывает.
 *   2. Брались только `CONFIRMED`. Все студийные записи, онлайн-записи мастеров
 *      без автоподтверждения и ручные записи рождаются `PENDING`, и после начала
 *      визита подтвердить их уже нельзя — такой визит запроса не получал
 *      никогда, хотя оставить отзыв сервер ему разрешает. Теперь отбор тот же,
 *      что у права на отзыв: любой статус, кроме закрытых.
 *   3. Пакет из N услуг давал N запросов подряд. Теперь запрос один — по
 *      последней по времени услуге пакета.
 */
const PROMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const GRACE_MS = REVIEW_GRACE_MINUTES * 60 * 1000;

/** Закрытые статусы — отзыв по ним не оставить (`reviewWindowFor`). */
const NON_REVIEWABLE_STATUSES: BookingStatus[] = [
  BookingStatus.REJECTED,
  BookingStatus.CANCELLED,
  BookingStatus.NO_SHOW,
];

export async function runBookingReviewPromptJob(now = new Date()): Promise<void> {
  // Окно отзыва открывается в `endAtUtc + grace` — запрос уходит не раньше.
  const readyBefore = new Date(now.getTime() - GRACE_MS);
  const windowStart = new Date(readyBefore.getTime() - PROMPT_WINDOW_MS);

  const candidates = await prisma.booking.findMany({
    where: {
      status: { notIn: NON_REVIEWABLE_STATUSES },
      endAtUtc: { gte: windowStart, lte: readyBefore },
      clientUserId: { not: null },
      review: { is: null },
    },
    select: { id: true, bookingPackageId: true, endAtUtc: true },
    take: 200,
  });
  if (candidates.length === 0) return;

  const promptable = await dropNonFinalPackageComponents(candidates);
  if (promptable.length === 0) return;

  const bookingIds = promptable.map((item) => item.id);
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
  const pendingIds = bookingIds.filter((id) => !notifiedSet.has(id));
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

type PromptCandidate = { id: string; bookingPackageId: string | null; endAtUtc: Date | null };

/**
 * Из компонентов пакета оставляет только ПОСЛЕДНИЙ по времени (среди всех
 * живых компонентов пакета, а не только попавших в выборку): запрос отзыва
 * уходит, когда закончился весь пакет, и ровно один раз.
 */
async function dropNonFinalPackageComponents(
  candidates: PromptCandidate[],
): Promise<PromptCandidate[]> {
  const packageIds = Array.from(
    new Set(candidates.map((c) => c.bookingPackageId).filter((id): id is string => Boolean(id))),
  );
  if (packageIds.length === 0) return candidates;

  const components = await prisma.booking.findMany({
    where: { bookingPackageId: { in: packageIds }, status: { notIn: NON_REVIEWABLE_STATUSES } },
    select: { id: true, bookingPackageId: true, endAtUtc: true },
  });
  const finalByPackage = new Map<string, string>();
  for (const packageId of packageIds) {
    const last = components
      .filter((c) => c.bookingPackageId === packageId)
      .sort(
        (a, b) =>
          (b.endAtUtc?.getTime() ?? 0) - (a.endAtUtc?.getTime() ?? 0) || b.id.localeCompare(a.id),
      )[0];
    if (last) finalByPackage.set(packageId, last.id);
  }

  return candidates.filter(
    (c) => !c.bookingPackageId || finalByPackage.get(c.bookingPackageId) === c.id,
  );
}
