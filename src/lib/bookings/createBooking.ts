import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BookingCreateInput } from "@/lib/domain/bookings";
import { AppError } from "@/lib/api/errors";
import {
  createBookingConfirmedNotifications,
  createBookingRequestNotifications,
  publishNotifications,
  type NotificationRecord,
} from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import { checkRateLimit } from "@/lib/rateLimit/rateLimiter";
import { CREATE_BOOKING_RATE_LIMIT } from "@/lib/bookings/rateLimit";
import { checkAndSetIdempotency } from "@/lib/idempotency/idempotency";
import {
  buildCreateBookingIdempotencyKey,
  CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
} from "@/lib/bookings/idempotency";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";

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
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
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
  // AUDIT (создание записи):
  // - реализовано: создаётся PENDING + actionRequiredBy=MASTER, запись не удаляется.
  // - реализовано: startAtUtc/endAtUtc сохраняются, что поддерживает серверные проверки 60 минут и runtime-статусы.
  if (input.clientUserId && input.idempotencyKey) {
    const key = buildCreateBookingIdempotencyKey(input.clientUserId, input.idempotencyKey);
    const allowed = await checkAndSetIdempotency(
      key,
      CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS
    );
    if (!allowed) {
      throw new AppError("Duplicate request", 409, "DUPLICATE_REQUEST");
    }
  }

  if (input.clientUserId) {
    const allowed = await checkRateLimit(
      `rate:createBooking:${input.clientUserId}`,
      CREATE_BOOKING_RATE_LIMIT.limit,
      CREATE_BOOKING_RATE_LIMIT.windowSeconds
    );
    if (!allowed) {
      throw new AppError("Rate limit exceeded", 429, "RATE_LIMITED");
    }
  }

  let transactionCommitted = false;
  const publishAfterCommit = (notifications: NotificationRecord[]) => {
    if (process.env.NODE_ENV !== "production" && !transactionCommitted) {
      throw new Error("Notifications published before transaction commit");
    }
    publishNotifications(notifications);
  };

  const { created, sideEffects } = await prisma.$transaction(
    async (tx) => {
      let masterBufferMin: number | null = null;
      let resolvedMasterProviderId: string | null = input.masterProviderId ?? null;
      const provider = await tx.provider.findUnique({
        where: { id: input.providerId },
        select: {
          id: true,
          type: true,
          studioId: true,
          autoConfirmBookings: true,
          bufferBetweenBookingsMin: true,
        },
      });
      if (!provider) throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");

      const service = await tx.service.findUnique({
        where: { id: input.serviceId },
        select: { id: true, providerId: true, durationMin: true },
      });
      if (!service) throw new AppError("Service not found", 404, "SERVICE_NOT_FOUND");

      if (provider.type === ProviderType.STUDIO) {
        if (!resolvedMasterProviderId) {
          throw new AppError("Master is required", 400, "MASTER_REQUIRED");
        }

        const master = await tx.provider.findUnique({
          where: { id: resolvedMasterProviderId },
          select: { id: true, type: true, studioId: true, bufferBetweenBookingsMin: true },
        });
        if (!master || master.type !== ProviderType.MASTER || master.studioId !== provider.id) {
          throw new AppError("Master not found", 404, "MASTER_NOT_FOUND");
        }

        if (service.providerId !== provider.id) {
          throw new AppError("Service not in studio", 400, "SERVICE_INVALID");
        }
        resolvedMasterProviderId = master.id;
        masterBufferMin = normalizeBufferMinutes(master.bufferBetweenBookingsMin);
      } else if (provider.type === ProviderType.MASTER) {
        if (service.providerId !== provider.id) {
          throw new AppError("Service not in provider", 400, "SERVICE_INVALID");
        }
        resolvedMasterProviderId = provider.id;
      } else if (service.providerId !== provider.id) {
        throw new AppError("Service not in provider", 400, "SERVICE_INVALID");
      }

      let durationMin = service.durationMin;
      if (provider.type === ProviderType.STUDIO && resolvedMasterProviderId) {
        const override = await tx.masterService.findUnique({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: resolvedMasterProviderId,
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

      if (provider.type === ProviderType.STUDIO && resolvedMasterProviderId) {
        const bufferMin = masterBufferMin ?? 0;
        await ensureNoConflicts(tx, {
          providerId: input.providerId,
          masterProviderId: resolvedMasterProviderId,
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

      const shouldAutoConfirm =
        provider.type === ProviderType.MASTER && !provider.studioId && provider.autoConfirmBookings;

      const created = await tx.booking.create({
        data: {
          providerId: input.providerId,
          serviceId: input.serviceId,
          masterProviderId: resolvedMasterProviderId,
          masterId: resolvedMasterProviderId,
          startAtUtc,
          endAtUtc,
          slotLabel: input.slotLabel,
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          comment: input.comment ?? null,
          silentMode: input.silentMode ?? false,
          clientUserId: input.clientUserId ?? null,
          status: shouldAutoConfirm ? "CONFIRMED" : "PENDING",
          actionRequiredBy: shouldAutoConfirm ? null : "MASTER",
        },
        select: {
          id: true,
          slotLabel: true,
          status: true,
          providerId: true,
          masterProviderId: true,
          clientUserId: true,
          clientName: true,
          clientPhone: true,
          comment: true,
          silentMode: true,
          startAtUtc: true,
          endAtUtc: true,
          proposedStartAt: true,
          proposedEndAt: true,
          requestedBy: true,
          actionRequiredBy: true,
          changeComment: true,
          clientChangeRequestsCount: true,
          masterChangeRequestsCount: true,
          service: { select: { id: true, name: true } },
        },
      });

      let notifications: NotificationRecord[] = [];
      let notificationError: Error | null = null;
      try {
        notifications = shouldAutoConfirm
          ? await createBookingConfirmedNotifications({
              bookingId: created.id,
              notifyClient: true,
              notifyMaster: true,
              masterMode: "AUTO",
              db: tx,
            })
          : await createBookingRequestNotifications({ bookingId: created.id, db: tx });
      } catch (error) {
        notificationError =
          error instanceof Error ? error : new Error("Failed to create booking notifications");
      }

      return {
        created,
        sideEffects: {
          bookingId: created.id,
          providerId: created.providerId,
          clientUserId: created.clientUserId ?? null,
          notifications,
          notificationError,
        },
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );

  transactionCommitted = true;

  if (sideEffects.notificationError) {
    console.error("Failed to create booking notifications:", sideEffects.notificationError);
  }

  if (sideEffects.notifications.length > 0) {
    publishAfterCommit(sideEffects.notifications);
  }

  try {
    await sendBookingTelegramNotifications(created.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    console.error("Failed to send Telegram booking notifications:", error);
  }

  await invalidateSlotsForBookingRange({
    providerId: created.providerId,
    masterProviderId: created.masterProviderId ?? null,
    startAtUtc: created.startAtUtc,
    endAtUtc: created.endAtUtc,
  });

  return toBookingDto(created);
}
