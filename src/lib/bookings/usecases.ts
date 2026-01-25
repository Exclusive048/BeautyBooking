import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import type { BookingCancelInput, BookingCreateInput } from "@/lib/domain/bookings";
import { ProviderType } from "@prisma/client";

type BookingRecord = {
  id: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
};

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

export async function createBooking(input: BookingCreateInput): Promise<Result<BookingRecord>> {
  const provider = await prisma.provider.findUnique({
    where: { id: input.providerId },
    select: { id: true, type: true },
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
      select: { id: true, type: true, studioId: true },
    });
    if (!master || master.type !== ProviderType.MASTER || master.studioId !== provider.id) {
      return { ok: false, status: 404, message: "Master not found", code: "MASTER_NOT_FOUND" };
    }

    if (service.providerId !== provider.id) {
      return { ok: false, status: 400, message: "Service not in studio", code: "SERVICE_INVALID" };
    }
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

  const conflictWhere = input.masterProviderId
    ? { providerId: input.providerId, masterProviderId: input.masterProviderId }
    : { providerId: input.providerId };

  const conflicts = await prisma.booking.findMany({
    where: {
      ...conflictWhere,
      status: { not: "CANCELLED" },
      startAtUtc: { not: null, lt: endAtUtc },
      endAtUtc: { not: null, gt: startAtUtc },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) =>
    b.startAtUtc && b.endAtUtc ? overlaps(startAtUtc, endAtUtc, b.startAtUtc, b.endAtUtc) : false
  );
  if (conflict) {
    return { ok: false, status: 409, message: "Time slot is not available", code: "SLOT_CONFLICT" };
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

  return { ok: true, data: created };
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

  const conflictWhere = booking.masterProviderId
    ? { providerId: booking.providerId, masterProviderId: booking.masterProviderId }
    : { providerId: booking.providerId };

  const conflicts = await prisma.booking.findMany({
    where: {
      ...conflictWhere,
      id: { not: booking.id },
      status: { not: "CANCELLED" },
      startAtUtc: { not: null, lt: endAtUtc },
      endAtUtc: { not: null, gt: startAtUtc },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) =>
    b.startAtUtc && b.endAtUtc
      ? overlaps(startAtUtc, endAtUtc, b.startAtUtc, b.endAtUtc)
      : false
  );
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

  return { ok: true, data: updated };
}
