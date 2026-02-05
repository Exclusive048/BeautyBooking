import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { createBookingNotifications } from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import type { BookingCancelInput } from "@/lib/domain/bookings";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";
import {
  canCancelOrReschedule,
  ensureBookingActionWindow,
  resolveBookingRuntimeStatus,
} from "@/lib/bookings/flow";

export async function cancelBooking(input: BookingCancelInput): Promise<BookingStatusUpdateDto> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
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

  const updated = await prisma.booking.update({
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
          requestedBy: input.cancelledBy === "CLIENT" ? "CLIENT" : "MASTER",
          actionRequiredBy: null,
          proposedStartAt: null,
          proposedEndAt: null,
        },
    select: { id: true, status: true },
  });

  try {
    await createBookingNotifications({
      bookingId: updated.id,
      kind: declinesMasterChange ? "RESCHEDULED" : "REJECTED",
    });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  if (!declinesMasterChange) {
    try {
      await sendBookingTelegramNotifications(updated.id, "CANCELLED");
    } catch (error) {
      console.error("Failed to send Telegram booking notifications:", error);
    }
  }

  return { id: updated.id, status: updated.status };
}
