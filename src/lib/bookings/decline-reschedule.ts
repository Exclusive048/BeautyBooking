import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";
import { resolveBookingRuntimeStatus, type BookingActor } from "@/lib/bookings/flow";

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
  if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });
  if (runtimeStatus !== "CHANGE_REQUESTED") {
    throw new AppError("Booking has no pending reschedule", 409, "CONFLICT");
  }
  if (!booking.actionRequiredBy || booking.actionRequiredBy !== actor) {
    throw new AppError("Action is required from another side", 409, "CONFLICT");
  }

  const updated = await prisma.booking.update({
    where: { id: booking.id },
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

  return { id: updated.id, status: updated.status };
}
