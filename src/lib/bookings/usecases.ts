import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import type { BookingCancelInput, BookingCreateInput } from "@/lib/domain/bookings";
import { ProviderType } from "@prisma/client";
import { createBookingNotifications } from "@/lib/notifications/service";

type BookingRecord = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
};

type RescheduleRecord = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  slotLabel: string;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
};

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

export async function createBooking(input: BookingCreateInput): Promise<Result<BookingRecord>> {
  let masterBufferMin: number | null = null;
  const provider = await prisma.provider.findUnique({
    where: { id: input.providerId },
    select: { id: true, type: true, bufferBetweenBookingsMin: true },
  });
  if (!provider) return { ok: false, status: 404, message: "Provider not found", code: "PROVIDER_NOT_FOUND" };

  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    select: { id: true, providerId: true, durationMin: true },
  });
  if (!service) return { ok: false, status: 404, message: "Service not found", code: "SERVICE_NOT_FOUND" };

  if (provider.type === ProviderType.STUDIO) {
    if (!input.masterProviderId) {
      return { ok: false, status: 400, message: "Master is required", code: "MASTER_REQUIRED" };
    }

    const master = await prisma.provider.findUnique({
      where: { id: input.masterProviderId },
      select: { id: true, type: true, studioId: true, bufferBetweenBookingsMin: true },
    });
    if (!master || master.type !== ProviderType.MASTER || master.studioId !== provider.id) {
      return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
    }

    if (service.providerId !== provider.id) {
      return { ok: false, status: 400, message: "Service not in studio", code: "SERVICE_INVALID" };
    }
    masterBufferMin = normalizeBufferMinutes(master.bufferBetweenBookingsMin);
  } else if (service.providerId !== provider.id) {
    return { ok: false, status: 400, message: "Service not in provider", code: "SERVICE_INVALID" };
  }

  let durationMin = service.durationMin;
  if (provider.type === ProviderType.STUDIO && input.masterProviderId) {
    const override = await prisma.masterService.findUnique({
      where: {
        masterProviderId_serviceId: {
          masterProviderId: input.masterProviderId,
          serviceId: service.id,
        },
      },
      select: { durationOverrideMin: true, isEnabled: true },
    });

    if (override && override.isEnabled === false) {
      return { ok: false, status: 409, message: "Service disabled for master", code: "SERVICE_DISABLED" };
    }

    durationMin = override?.durationOverrideMin ?? durationMin;
  }

  const startAtUtc = input.startAtUtc;
  if (!isValidDate(startAtUtc)) {
    return { ok: false, status: 400, message: "startAtUtc is required", code: "START_REQUIRED" };
  }

  const endAtUtc = isValidDate(input.endAtUtc)
    ? input.endAtUtc
    : new Date(startAtUtc.getTime() + durationMin * 60 * 1000);

  if (provider.type === ProviderType.STUDIO && input.masterProviderId) {
    const bufferMin = masterBufferMin ?? 0;
    const result = await ensureNoConflicts(
      input.providerId,
      input.masterProviderId,
      startAtUtc,
      endAtUtc,
      bufferMin
    );
    if (!result.ok) return result;
  }

  if (provider.type === ProviderType.MASTER) {
    const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);
    const result = await ensureNoConflicts(input.providerId, null, startAtUtc, endAtUtc, bufferMin);
    if (!result.ok) return result;
  }

  const created = await prisma.booking.create({
    data: {
      providerId: input.providerId,
      serviceId: input.serviceId,
      masterProviderId: input.masterProviderId ?? null,
      startAtUtc,
      endAtUtc,
      slotLabel: input.slotLabel,
      clientName: input.clientName,
      clientPhone: input.clientPhone,
      comment: input.comment ?? null,
      clientUserId: input.clientUserId ?? null,
      status: "PENDING",
    },
    select: { id: true, status: true },
  });

  try {
    await createBookingNotifications({ bookingId: created.id, kind: "CREATED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  return { ok: true, data: created };
}

async function ensureNoConflicts(
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
      status: { not: "CANCELLED" },
      startAtUtc: { not: null, lt: bufferedEnd },
      endAtUtc: { not: null, gt: bufferedStart },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) => {
    if (!b.startAtUtc || !b.endAtUtc) return false;
    const bufferedStart = bufferMin ? shiftMinutes(b.startAtUtc, -bufferMin) : b.startAtUtc;
    const bufferedEnd = bufferMin ? shiftMinutes(b.endAtUtc, bufferMin) : b.endAtUtc;
    return overlaps(startAtUtc, endAtUtc, bufferedStart, bufferedEnd);
  });

  if (conflict) {
    return { ok: false, status: 409, message: "Time slot is not available", code: "SLOT_CONFLICT" };
  }

  return { ok: true, data: null };
}

export async function confirmBooking(bookingId: string): Promise<Result<BookingRecord>> {
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
  if (!booking) return { ok: false, status: 404, message: "Booking not found", code: "BOOKING_NOT_FOUND" };

  if (booking.status === "CANCELLED") {
    return { ok: false, status: 409, message: "Booking cancelled", code: "BOOKING_CANCELLED" };
  }

  if (booking.status === "CONFIRMED") return { ok: true, data: { id: booking.id, status: booking.status } };

  const startAtUtc = booking.startAtUtc;
  const endAtUtc = booking.endAtUtc;
  if (!isValidDate(startAtUtc) || !isValidDate(endAtUtc)) {
    return { ok: false, status: 409, message: "Booking time is missing", code: "BOOKING_TIME_REQUIRED" };
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
    const bufferedStart = bufferMin ? shiftMinutes(b.startAtUtc, -bufferMin) : b.startAtUtc;
    const bufferedEnd = bufferMin ? shiftMinutes(b.endAtUtc, bufferMin) : b.endAtUtc;
    return overlaps(startAtUtc, endAtUtc, bufferedStart, bufferedEnd);
  });
  if (conflict) {
    return { ok: false, status: 409, message: "Time slot is not available", code: "SLOT_CONFLICT" };
  }

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status: "CONFIRMED" },
    select: { id: true, status: true },
  });

  return { ok: true, data: updated };
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

export async function cancelBooking(input: BookingCancelInput): Promise<Result<BookingRecord>> {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: { id: true, status: true },
  });
  if (!booking) return { ok: false, status: 404, message: "Booking not found", code: "BOOKING_NOT_FOUND" };

  if (booking.status === "CANCELLED") {
    return { ok: false, status: 409, message: "Booking already cancelled", code: "BOOKING_CANCELLED" };
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

  return { ok: true, data: updated };
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
      startAtUtc: true,
      endAtUtc: true,
    },
  });

  try {
    await createBookingNotifications({ bookingId: updated.id, kind: "RESCHEDULED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  return { ok: true, data: updated };
}
