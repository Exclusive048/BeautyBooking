import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BookingCreateInput } from "@/lib/domain/bookings";
import { AppError } from "@/lib/api/errors";
import { createBookingNotifications } from "@/lib/notifications/service";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";

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

type ConflictCheckInput = {
  providerId: string;
  masterProviderId: string | null;
  startAtUtc: Date;
  endAtUtc: Date;
  bufferMin: number;
};

async function ensureNoConflicts(tx: Prisma.TransactionClient, input: ConflictCheckInput) {
  const bufferedStart = input.bufferMin ? shiftMinutes(input.startAtUtc, -input.bufferMin) : input.startAtUtc;
  const bufferedEnd = input.bufferMin ? shiftMinutes(input.endAtUtc, input.bufferMin) : input.endAtUtc;

  const conflictWhere = input.masterProviderId
    ? { providerId: input.providerId, masterProviderId: input.masterProviderId }
    : { providerId: input.providerId };

  const conflicts = await tx.booking.findMany({
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
    const itemStart = input.bufferMin ? shiftMinutes(b.startAtUtc, -input.bufferMin) : b.startAtUtc;
    const itemEnd = input.bufferMin ? shiftMinutes(b.endAtUtc, input.bufferMin) : b.endAtUtc;
    return overlaps(input.startAtUtc, input.endAtUtc, itemStart, itemEnd);
  });

  if (conflict) {
    throw new AppError("Time slot is not available", 409, "BOOKING_CONFLICT");
  }
}

export async function createBooking(input: BookingCreateInput): Promise<BookingDto> {
  return prisma.$transaction(
    async (tx) => {
      let masterBufferMin: number | null = null;
      const provider = await tx.provider.findUnique({
        where: { id: input.providerId },
        select: { id: true, type: true, bufferBetweenBookingsMin: true },
      });
      if (!provider) throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");

      const service = await tx.service.findUnique({
        where: { id: input.serviceId },
        select: { id: true, providerId: true, durationMin: true },
      });
      if (!service) throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");

      if (provider.type === ProviderType.STUDIO) {
        if (!input.masterProviderId) {
          throw new AppError("Master is required", 400, "MASTER_REQUIRED");
        }

        const master = await tx.provider.findUnique({
          where: { id: input.masterProviderId },
          select: { id: true, type: true, studioId: true, bufferBetweenBookingsMin: true },
        });
        if (!master || master.type !== ProviderType.MASTER || master.studioId !== provider.id) {
          throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
        }

        if (service.providerId !== provider.id) {
          throw new AppError("Service not in studio", 400, "SERVICE_INVALID");
        }
        masterBufferMin = normalizeBufferMinutes(master.bufferBetweenBookingsMin);
      } else if (service.providerId !== provider.id) {
        throw new AppError("Service not in provider", 400, "SERVICE_INVALID");
      }

      let durationMin = service.durationMin;
      if (provider.type === ProviderType.STUDIO && input.masterProviderId) {
        const override = await tx.masterService.findUnique({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: input.masterProviderId,
              serviceId: service.id,
            },
          },
          select: { durationOverrideMin: true, isEnabled: true },
        });

        if (override && override.isEnabled === false) {
          throw new AppError("Service disabled for master", 409, "SERVICE_DISABLED");
        }

        durationMin = override?.durationOverrideMin ?? durationMin;
      }

      const startAtUtc = input.startAtUtc;
      if (!isValidDate(startAtUtc)) {
        throw new AppError("startAtUtc is required", 400, "START_REQUIRED");
      }

      const endAtUtc = isValidDate(input.endAtUtc)
        ? input.endAtUtc
        : new Date(startAtUtc.getTime() + durationMin * 60 * 1000);

      if (provider.type === ProviderType.STUDIO && input.masterProviderId) {
        const bufferMin = masterBufferMin ?? 0;
        await ensureNoConflicts(tx, {
          providerId: input.providerId,
          masterProviderId: input.masterProviderId,
          startAtUtc,
          endAtUtc,
          bufferMin,
        });
      }

      if (provider.type === ProviderType.MASTER) {
        const bufferMin = normalizeBufferMinutes(provider.bufferBetweenBookingsMin);
        await ensureNoConflicts(tx, {
          providerId: input.providerId,
          masterProviderId: null,
          startAtUtc,
          endAtUtc,
          bufferMin,
        });
      }

      const created = await tx.booking.create({
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
        select: {
          id: true,
          slotLabel: true,
          status: true,
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
        await createBookingNotifications({ bookingId: created.id, kind: "CREATED" });
      } catch (error) {
        console.error("Failed to create booking notifications:", error);
      }

      return toBookingDto(created);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
}
