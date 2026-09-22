import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";
import { resolveBookingRuntimeStatus, type BookingActor } from "@/lib/bookings/flow";
import { applyBookingTransition } from "@/lib/bookings/transition";
import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";

/**
 * FIX-R2-06-A — decline a pending reschedule request (two-sided approval).
 *
 * Counterpart of {@link confirmBooking}: the side whose turn it is
 * (`actionRequiredBy === actor`) **declines** the other side's proposed time —
 * the booking reverts to its ORIGINAL time (`startAtUtc`/`endAtUtc` are left
 * untouched) and goes back to `CONFIRMED`, clearing the proposal. No conflict
 * re-check is needed: the booking still holds its original slot, nothing moves.
 *
 * Shared by the solo-master decline (`updateMasterBookingStatus` REJECTED on a
 * client-proposed CHANGE_REQUESTED) and the studio-admin decline route, so the
 * two paths cannot drift. Auth (who may act) is enforced by the caller/route;
 * this function enforces the state-machine rule (`actionRequiredBy === actor`).
 */
export async function declineClientRescheduleRequest(
  bookingId: string,
  actor: BookingActor,
): Promise<BookingStatusUpdateDto> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      startAtUtc: true,
      endAtUtc: true,
      actionRequiredBy: true,
      requestedBy: true,
    },
  });
  if (!booking) throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });
  if (runtimeStatus !== "CHANGE_REQUESTED") {
    throw new AppError("По записи нет запроса на перенос.", 409, "CONFLICT");
  }
  if (!booking.actionRequiredBy || booking.actionRequiredBy !== actor) {
    throw new AppError("Сейчас ответ за другой стороной. Дождитесь его и обновите страницу.", 409, "CONFLICT");
  }

  // LOGIC-02: переход только из наблюдённого статуса.
  const updated = await applyBookingTransition(prisma, {
    id: booking.id,
    expectedStatus: booking.status,
    data: {
      status: "CONFIRMED",
      proposedStartAt: null,
      proposedEndAt: null,
      requestedBy: null,
      actionRequiredBy: null,
      changeComment: null,
    },
    select: { id: true, status: true },
  });

  // REMINDER-STATUSES-01: отказ от переноса возвращает запись в CONFIRMED на
  // прежнем времени. Если перенос просили на ещё неподтверждённой записи,
  // напоминаний у неё не было никогда — планируем. Для уже подтверждённой это
  // безвредно: повтор отсекают отметки `reminder*SentAt`.
  await scheduleBookingRemindersSafe(updated.id);

  return { id: updated.id, status: updated.status };
}
