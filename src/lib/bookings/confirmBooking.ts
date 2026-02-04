import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { createBookingNotifications } from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

async function resolveBufferMinutes(
  providerId: string,
  masterProviderId: string | null
): Promise<number> {
  if (masterProviderId) {
    const master = await prisma.provider.findUnique({
      where: { id: masterProviderId },
      select: { bufferBetweenBookingsMin: true },
    });
    return normalizeBufferMinutes(master?.bufferBetweenBookingsMin);
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { bufferBetweenBookingsMin: true },
  });
  return normalizeBufferMinutes(provider?.bufferBetweenBookingsMin);
}

export async function confirmBooking(bookingId: string): Promise<BookingStatusUpdateDto> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      startAtUtc: true,
      endAtUtc: true,
    },
  });
  if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

  if (booking.status === "CANCELLED") {
    throw new AppError("Booking cancelled", 409, "BOOKING_CANCELLED");
  }

  if (booking.status === "CONFIRMED") {
    return { id: booking.id, status: booking.status };
  }

  const startAtUtc = booking.startAtUtc;
  const endAtUtc = booking.endAtUtc;
  if (!isValidDate(startAtUtc) || !isValidDate(endAtUtc)) {
    throw new AppError("Booking time is missing", 409, "BOOKING_TIME_REQUIRED");
  }

  const bufferMin = await resolveBufferMinutes(booking.providerId, booking.masterProviderId);
  const conflictWhere = booking.masterProviderId
    ? { providerId: booking.providerId, masterProviderId: booking.masterProviderId }
    : { providerId: booking.providerId };

  const bufferedStart = bufferMin ? shiftMinutes(startAtUtc, -bufferMin) : startAtUtc;
  const bufferedEnd = bufferMin ? shiftMinutes(endAtUtc, bufferMin) : endAtUtc;

  const conflicts = await prisma.booking.findMany({
    where: {
      ...conflictWhere,
      id: { not: booking.id },
      status: { not: "CANCELLED" },
      startAtUtc: { not: null, lt: bufferedEnd },
      endAtUtc: { not: null, gt: bufferedStart },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) => {
    if (!b.startAtUtc || !b.endAtUtc) return false;
    const itemStart = bufferMin ? shiftMinutes(b.startAtUtc, -bufferMin) : b.startAtUtc;
    const itemEnd = bufferMin ? shiftMinutes(b.endAtUtc, bufferMin) : b.endAtUtc;
    return overlaps(startAtUtc, endAtUtc, itemStart, itemEnd);
  });
  if (conflict) {
    throw new AppError("Time slot is not available", 409, "SLOT_CONFLICT");
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED" },
    select: { id: true, status: true },
  });

  try {
    await createBookingNotifications({ bookingId: updated.id, kind: "CONFIRMED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  try {
    await sendBookingTelegramNotifications(updated.id, "CONFIRMED", { notifyMasterOnConfirm: false });
  } catch (error) {
    console.error("Failed to send Telegram booking notifications:", error);
  }

  return { id: updated.id, status: updated.status };
}
