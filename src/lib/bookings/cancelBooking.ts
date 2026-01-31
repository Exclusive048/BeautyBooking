import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { createBookingNotifications } from "@/lib/notifications/service";
import type { BookingCancelInput } from "@/lib/domain/bookings";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";

export async function cancelBooking(input: BookingCancelInput): Promise<BookingStatusUpdateDto> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, status: true },
  });
  if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

  if (booking.status === "CANCELLED") {
    throw new AppError("Booking already cancelled", 409, "BOOKING_CANCELLED");
  }

  const updated = await prisma.booking.update({
    where: { id: input.bookingId },
    data: {
      status: "CANCELLED",
      cancelledBy: input.cancelledBy,
      cancelReason: input.reason ?? null,
    },
    select: { id: true, status: true },
  });

  try {
    await createBookingNotifications({ bookingId: updated.id, kind: "CANCELLED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  return { id: updated.id, status: updated.status };
}
