import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import { createBookingNotifications } from "@/lib/notifications/service";
import { toBookingDto } from "@/lib/bookings/mappers";
import type { BookingDto } from "@/lib/bookings/dto";

type RescheduleRecord = BookingDto;

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

async function ensureNoConflictsExcluding(
  bookingId: string,
  providerId: string,
  masterProviderId: string | null,
  startAtUtc: Date,
  endAtUtc: Date,
  bufferMin: number
): Promise<Result<null>> {
  const bufferedStart = bufferMin ? shiftMinutes(startAtUtc, -bufferMin) : startAtUtc;
  const bufferedEnd = bufferMin ? shiftMinutes(endAtUtc, bufferMin) : endAtUtc;

  const conflictWhere = masterProviderId
    ? { providerId, masterProviderId }
    : { providerId };

  const conflicts = await prisma.booking.findMany({
    where: {
      ...conflictWhere,
      id: { not: bookingId },
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
    return { ok: false, status: 409, message: "Time slot is not available", code: "SLOT_CONFLICT" };
  }

  return { ok: true, data: null };
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

export async function rescheduleBooking(input: {
  bookingId: string;
  startAtUtc: Date;
  endAtUtc: Date;
  slotLabel: string;
}): Promise<Result<RescheduleRecord>> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
      providerId: true,
      masterProviderId: true,
    },
  });
  if (!booking) return { ok: false, status: 404, message: "Booking not found", code: "BOOKING_NOT_FOUND" };

  if (booking.status === "CANCELLED") {
    return { ok: false, status: 409, message: "Booking cancelled", code: "BOOKING_CANCELLED" };
  }

  if (!isValidDate(input.startAtUtc) || !isValidDate(input.endAtUtc)) {
    return { ok: false, status: 400, message: "Invalid booking time", code: "DATE_INVALID" };
  }

  const bufferMin = await resolveBufferMinutes(booking.providerId, booking.masterProviderId);
  const conflict = await ensureNoConflictsExcluding(
    booking.id,
    booking.providerId,
    booking.masterProviderId ?? null,
    input.startAtUtc,
    input.endAtUtc,
    bufferMin
  );
  if (!conflict.ok) return conflict;

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
      slotLabel: input.slotLabel,
    },
    select: {
      id: true,
      status: true,
      slotLabel: true,
      providerId: true,
      masterProviderId: true,
      clientName: true,
      clientPhone: true,
      comment: true,
      startAtUtc: true,
      endAtUtc: true,
      service: { select: { id: true, name: true } },
    },
  });

  try {
    await createBookingNotifications({ bookingId: updated.id, kind: "RESCHEDULED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  return { ok: true, data: toBookingDto(updated) };
}
