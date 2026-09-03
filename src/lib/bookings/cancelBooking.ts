import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BookingCancelInput } from "@/lib/domain/bookings";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";
import {
  canCancelOrReschedule,
  ensureCancellationDeadline,
  ensureBookingActionWindow,
  resolveBookingRuntimeStatus,
} from "@/lib/bookings/flow";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { emitBookingCancelledSystemMessage } from "@/lib/chat/system-messages";
import { logError } from "@/lib/logging/logger";
import { applyBookingTransition } from "@/lib/bookings/transition";

/**
 * Всё, что делается ПОСЛЕ коммита отмены: инвалидация слотов и системное
 * сообщение в чат. Вынесено в данные, чтобы вызывающий, которому отмена нужна
 * внутри своей транзакции (LOGIC-13 — отметка дня выходным), мог отложить
 * побочные эффекты до коммита и не рассылать их при откате.
 */
export type CancelBookingSideEffects = {
  bookingId: string;
  providerId: string;
  masterProviderId: string | null;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  cancelledBy: BookingCancelInput["cancelledBy"];
  /** Клиент отклонил мастерский перенос — бронь осталась CONFIRMED, отмены не было. */
  declinesMasterChange: boolean;
};

/**
 * Отмена внутри ЧУЖОЙ транзакции: только чтение + переход статуса, без
 * побочных эффектов. Возвращает их описание — вызывающий обязан прогнать
 * `runCancelBookingSideEffects` после коммита.
 *
 * Чтение брони живёт внутри `tx` намеренно: наблюдённый статус, на который
 * опирается оптимистическая блокировка `applyBookingTransition` (LOGIC-02),
 * должен быть прочитан в той же транзакции, в которой пишется.
 */
export async function cancelBookingInTx(
  tx: Prisma.TransactionClient,
  input: BookingCancelInput
): Promise<{ dto: BookingStatusUpdateDto; sideEffects: CancelBookingSideEffects }> {
  // AUDIT (отмена/отклонение):
  // - реализовано: отмена/отклонение меняет статус, удаления записи нет.
  // - реализовано: CLIENT/PROVIDER отмена -> REJECTED, requestedBy проставляется.
  // - реализовано: клиентский отказ от мастерского переноса оставляет CONFIRMED и очищает proposed*.
  // - реализовано: правило 60 минут проверяется на сервере для отмены (кроме reject ветки переноса).
  const booking = await tx.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      startAtUtc: true,
      endAtUtc: true,
      proposedStartAt: true,
      proposedEndAt: true,
      requestedBy: true,
      actionRequiredBy: true,
      bookingPackageId: true,
      provider: { select: { cancellationDeadlineHours: true } },
    },
  });
  if (!booking) throw new AppError("Запись не найдена.", 404, "BOOKING_NOT_FOUND");

  // PACKAGE-BOOKING-MVP-1: a package child must NOT be cancelled alone —
  // that would leave the discounted siblings as a broken partial package.
  // The whole package is cancelled atomically via cancelSoloPackageBooking
  // (POST /api/bookings/package/[id]/cancel). Block the lone-child path.
  if (booking.bookingPackageId) {
    throw new AppError(
      "Этот пакет отменяется целиком.",
      409,
      "PACKAGE_CANCEL_WHOLE",
      { bookingPackageId: booking.bookingPackageId },
    );
  }

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  if (runtimeStatus === "REJECTED") {
    throw new AppError("Запись уже отменена.", 409, "BOOKING_CANCELLED");
  }

  if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
    throw new AppError("Запись уже началась.", 409, "CONFLICT");
  }

  const declinesMasterChange =
    input.cancelledBy === "CLIENT" &&
    runtimeStatus === "CHANGE_REQUESTED" &&
    booking.requestedBy === "MASTER" &&
    booking.actionRequiredBy === "CLIENT";

  if (!declinesMasterChange) {
    if (!canCancelOrReschedule(booking.status)) {
      throw new AppError("Эту запись уже нельзя отменить.", 409, "CONFLICT");
    }
    if (input.cancelledBy === "CLIENT") {
      ensureBookingActionWindow(booking.startAtUtc);
      ensureCancellationDeadline(booking.startAtUtc, booking.provider.cancellationDeadlineHours);
    }
    // FIX-STUDIO-02 (F3): provider-side cancellation reason is OPTIONAL. The
    // studio cancel dialog labels it «необязательно» and `bookingCancelSchema`
    // already marks `reason` optional — the old required-comment guard threw a
    // raw English «Comment is required» that leaked straight into the dialog
    // (an API/UI contract violation). Mirrors the reschedule precedent
    // (fix-04a), which dropped the identical guard for the same reason; the
    // client-cancel path never required one either. When a reason IS provided
    // it still flows into `cancelReason` + the "cancelled by master"
    // notification below.
  }

  // LOGIC-02: переход только из наблюдённого статуса — иначе отмена ложится
  // поверх уже подтверждённого мастером переноса (и наоборот).
  const updated = await applyBookingTransition(tx, {
    id: input.bookingId,
    expectedStatus: booking.status,
    data: declinesMasterChange
      ? {
          status: "CONFIRMED",
          actionRequiredBy: null,
          requestedBy: null,
          changeComment: null,
          proposedStartAt: null,
          proposedEndAt: null,
        }
      : {
          status: "REJECTED",
          cancelledBy: input.cancelledBy,
          cancelReason: input.reason?.trim() || null,
          cancelledAtUtc: new Date(),
          requestedBy: input.cancelledBy === "CLIENT" ? "CLIENT" : "MASTER",
          actionRequiredBy: null,
          proposedStartAt: null,
          proposedEndAt: null,
        },
    select: { id: true, status: true },
  });

  return {
    dto: { id: updated.id, status: updated.status },
    sideEffects: {
      bookingId: booking.id,
      providerId: booking.providerId,
      masterProviderId: booking.masterProviderId ?? null,
      startAtUtc: booking.startAtUtc,
      endAtUtc: booking.endAtUtc,
      cancelledBy: input.cancelledBy,
      declinesMasterChange,
    },
  };
}

/** Побочные эффекты отмены. Вызывать ТОЛЬКО после коммита транзакции. */
export async function runCancelBookingSideEffects(
  effects: CancelBookingSideEffects
): Promise<void> {
  // Ветка «клиент отклонил мастерский перенос» ничего не отменяет — бронь
  // остаётся CONFIRMED, только сбрасываются proposed*. Ни слоты, ни чат
  // трогать не нужно.
  if (effects.declinesMasterChange) return;

  await invalidateSlotsForBookingRange({
    providerId: effects.providerId,
    masterProviderId: effects.masterProviderId,
    startAtUtc: effects.startAtUtc,
    endAtUtc: effects.endAtUtc,
  });

  try {
    await emitBookingCancelledSystemMessage({
      bookingId: effects.bookingId,
      by: effects.cancelledBy === "CLIENT" ? "CLIENT" : "MASTER",
    });
  } catch (error) {
    logError("Failed to emit booking system message (cancel)", {
      bookingId: effects.bookingId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function cancelBooking(input: BookingCancelInput): Promise<BookingStatusUpdateDto> {
  const { dto, sideEffects } = await prisma.$transaction((tx) => cancelBookingInTx(tx, input));
  await runCancelBookingSideEffects(sideEffects);
  return dto;
}
