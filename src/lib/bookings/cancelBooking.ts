import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import {
  createBookingDeclinedNotifications,
  createBookingNotifications,
  publishNotifications,
  type NotificationRecord,
} from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import type { BookingCancelInput } from "@/lib/domain/bookings";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";
import {
  canCancelOrReschedule,
  ensureBookingActionWindow,
  resolveBookingRuntimeStatus,
} from "@/lib/bookings/flow";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";

export async function cancelBooking(input: BookingCancelInput): Promise<BookingStatusUpdateDto> {
  // AUDIT (отмена/отклонение):
  // - реализовано: отмена/отклонение меняет статус, удаления записи нет.
  // - реализовано: CLIENT/PROVIDER отмена -> REJECTED, requestedBy проставляется.
  // - реализовано: клиентский отказ от мастерского переноса оставляет CONFIRMED и очищает proposed*.
  // - реализовано: правило 60 минут проверяется на сервере для отмены (кроме reject ветки переноса).
  const booking = await prisma.booking.findUnique({
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
    },
  });
  if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  if (runtimeStatus === "REJECTED") {
    throw new AppError("Booking already cancelled", 409, "BOOKING_CANCELLED");
  }

  if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
    throw new AppError("Booking already started", 409, "CONFLICT");
  }

  const declinesMasterChange =
    input.cancelledBy === "CLIENT" &&
    runtimeStatus === "CHANGE_REQUESTED" &&
    booking.requestedBy === "MASTER" &&
    booking.actionRequiredBy === "CLIENT";

  if (!declinesMasterChange) {
    if (!canCancelOrReschedule(booking.status)) {
      throw new AppError("Booking cannot be cancelled in current state", 409, "CONFLICT");
    }
    ensureBookingActionWindow(booking.startAtUtc);
    if (input.cancelledBy !== "CLIENT") {
      const reason = input.reason?.trim() ?? "";
      if (reason.length === 0) {
        throw new AppError("Comment is required", 400, "VALIDATION_ERROR");
      }
    }
  }

  const { updated, notifications } = await prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id: input.bookingId },
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

    let notifications: NotificationRecord[] = [];
    try {
      if (declinesMasterChange) {
        notifications = await createBookingNotifications(
          { bookingId: updated.id, kind: "RESCHEDULED" },
          tx
        );
      } else if (input.cancelledBy === "CLIENT") {
        notifications = await createBookingNotifications(
          { bookingId: updated.id, kind: "CANCELLED" },
          tx
        );
      } else {
        notifications = await createBookingDeclinedNotifications({ bookingId: updated.id, db: tx });
      }
    } catch (error) {
      console.error("Failed to create booking notifications:", error);
    }

    return { updated, notifications };
  });

  if (notifications.length > 0) {
    publishNotifications(notifications);
  }

  if (!declinesMasterChange) {
    try {
      await sendBookingTelegramNotifications(updated.id, "CANCELLED");
    } catch (error) {
      console.error("Failed to send Telegram booking notifications:", error);
    }
  }

  if (!declinesMasterChange) {
    await invalidateSlotsForBookingRange({
      providerId: booking.providerId,
      masterProviderId: booking.masterProviderId ?? null,
      startAtUtc: booking.startAtUtc,
      endAtUtc: booking.endAtUtc,
    });
  }

  return { id: updated.id, status: updated.status };
}
