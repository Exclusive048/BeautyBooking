import { prisma } from "@/lib/prisma";
import { AppError, resolveErrorCode } from "@/lib/api/errors";
import { ProviderType, Prisma } from "@prisma/client";
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
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";
import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";
import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";
import {
  createBookingConfirmedNotifications,
  createBookingRequestNotifications,
  loadBookingSnapshot,
  publishNotifications,
  type NotificationRecord,
} from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";

type DbClient = Prisma.TransactionClient | typeof prisma;

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

async function ensureNoConflicts(
  db: DbClient,
  input: {
    providerId: string;
    masterProviderId: string | null;
    startAtUtc: Date;
    endAtUtc: Date;
    bufferMin: number;
  }
): Promise<void> {
  const bufferedStart = input.bufferMin
    ? shiftMinutes(input.startAtUtc, -input.bufferMin)
    : input.startAtUtc;
  const bufferedEnd = input.bufferMin
    ? shiftMinutes(input.endAtUtc, input.bufferMin)
    : input.endAtUtc;

  const conflictWhere = input.masterProviderId
    ? { providerId: input.providerId, masterProviderId: input.masterProviderId }
    : { providerId: input.providerId };

  const conflicts = await db.booking.findMany({
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
    throw new AppError(
      "Слот уже занят. Обновите расписание и выберите другое время.",
      409,
      "SLOT_CONFLICT"
    );
  }
}

function mapAvailabilityError(code?: string): { message: string; status: number } {
  switch (code) {
    case "DURATION_INVALID":
      return { message: "Некорректная длительность услуги.", status: 400 };
    case "SERVICE_REQUIRED":
      return { message: "Не указана услуга.", status: 400 };
    case "DATE_INVALID":
      return { message: "Некорректная дата.", status: 400 };
    case "RANGE_INVALID":
      return { message: "Некорректный диапазон.", status: 400 };
    case "PROVIDER_NOT_FOUND":
    case "MASTER_NOT_FOUND":
      return { message: "Мастер не найден.", status: 404 };
    case "SERVICE_NOT_FOUND":
      return { message: "Услуга не найдена.", status: 404 };
    case "SERVICE_INVALID":
      return { message: "Услуга недоступна для мастера.", status: 409 };
    default:
      return { message: "Не удалось проверить доступность слота.", status: 500 };
  }
}

export async function createBooking(input: {
  providerId: string;
  serviceId: string;
  masterProviderId: string | null;
  startAtUtc: Date;
  endAtUtc: Date | null;
  slotLabel: string;
  clientName: string;
  clientPhone: string;
  comment: string | null | undefined;
  silentMode?: boolean;
  clientUserId: string;
  idempotencyKey?: string | null;
}): Promise<BookingDto> {
  if (input.idempotencyKey) {
    const key = buildCreateBookingIdempotencyKey(input.clientUserId, input.idempotencyKey);
    const allowed = await checkAndSetIdempotency(key, CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS);
    if (!allowed) {
      throw new AppError("Повторный запрос.", 409, "DUPLICATE_REQUEST");
    }
  }

  const allowed = await checkRateLimit(
    `rate:createBooking:${input.clientUserId}`,
    CREATE_BOOKING_RATE_LIMIT.limit,
    CREATE_BOOKING_RATE_LIMIT.windowSeconds
  );
  if (!allowed) {
    throw new AppError("Слишком много запросов. Попробуйте позже.", 429, "RATE_LIMITED");
  }

  const [provider, service] = await Promise.all([
    prisma.provider.findUnique({
      where: { id: input.providerId },
      select: {
        id: true,
        type: true,
        timezone: true,
        studioId: true,
        autoConfirmBookings: true,
        bufferBetweenBookingsMin: true,
      },
    }),
    prisma.service.findUnique({
      where: { id: input.serviceId },
      select: {
        id: true,
        providerId: true,
        name: true,
        durationMin: true,
        baseDurationMin: true,
        price: true,
        basePrice: true,
      },
    }),
  ]);

  if (!provider) {
    throw new AppError("Провайдер не найден.", 404, "PROVIDER_NOT_FOUND");
  }

  if (!service) {
    throw new AppError("Услуга не найдена.", 404, "SERVICE_NOT_FOUND");
  }

  const providerServiceMismatch =
    provider.type === ProviderType.MASTER
      ? service.providerId !== provider.id && service.providerId !== provider.studioId
      : service.providerId !== provider.id;
  if (providerServiceMismatch) {
    throw new AppError("Услуга не принадлежит провайдеру.", 400, "SERVICE_NOT_BELONGS_TO_PROVIDER");
  }

  const resolvedMasterProviderId =
    provider.type === ProviderType.MASTER ? provider.id : input.masterProviderId ?? null;

  const master =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? await prisma.provider.findUnique({
          where: { id: resolvedMasterProviderId },
          select: {
            id: true,
            type: true,
            studioId: true,
            timezone: true,
            bufferBetweenBookingsMin: true,
          },
        })
      : null;

  if (resolvedMasterProviderId && resolvedMasterProviderId !== provider.id && !master) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  if (master && provider.type === ProviderType.STUDIO && master.studioId !== provider.id) {
    throw new AppError("Мастер не найден.", 404, "MASTER_NOT_FOUND");
  }

  const needsOverride = provider.type === ProviderType.STUDIO || provider.studioId;
  const override =
    resolvedMasterProviderId && needsOverride
      ? await prisma.masterService.findUnique({
          where: {
            masterProviderId_serviceId: {
              masterProviderId: resolvedMasterProviderId,
              serviceId: service.id,
            },
          },
          select: {
            isEnabled: true,
            priceOverride: true,
            durationOverrideMin: true,
          },
        })
      : null;

  if (resolvedMasterProviderId && needsOverride) {
    if (!override || override.isEnabled === false) {
      throw new AppError("Мастер не оказывает выбранную услугу.", 409, "SERVICE_INVALID");
    }
  }

  const durationMin = override?.durationOverrideMin ?? service.baseDurationMin ?? service.durationMin;
  if (!Number.isInteger(durationMin) || durationMin <= 0) {
    throw new AppError("Некорректная длительность услуги.", 400, "DURATION_INVALID");
  }

  const startAtUtc = input.startAtUtc;
  if (!isValidDate(startAtUtc)) {
    throw new AppError("Некорректная дата начала.", 400, "DATE_INVALID");
  }

  const endAtUtc = input.endAtUtc ?? new Date(startAtUtc.getTime() + durationMin * 60 * 1000);
  if (!isValidDate(endAtUtc) || endAtUtc <= startAtUtc) {
    throw new AppError("Некорректная дата окончания.", 400, "DATE_INVALID");
  }

  const availabilityProviderId = resolvedMasterProviderId ?? provider.id;
  const availabilityTimezone = master?.timezone ?? provider.timezone;
  const availabilityStartedAt = Date.now();
  const availability = await listAvailabilitySlotsPaginated(
    availabilityProviderId,
    service.id,
    durationMin,
    {
      fromKey: toLocalDateKey(startAtUtc, availabilityTimezone),
      limit: 1,
    }
  );
  if (!availability.ok) {
    const mapped = mapAvailabilityError(availability.code);
    const code = resolveErrorCode(availability.code, "INTERNAL_ERROR");
    throw new AppError(mapped.message, mapped.status, code);
  }

  const hasSlot = availability.data.slots.some((slot) => {
    const slotStart = toDate(slot.startAtUtc);
    const slotEnd = toDate(slot.endAtUtc);
    if (!slotStart || !slotEnd) return false;
    return slotStart.getTime() === startAtUtc.getTime() && slotEnd.getTime() === endAtUtc.getTime();
  });
  const availabilityMs = Date.now() - availabilityStartedAt;
  console.info(`[booking:create] availability ms=${availabilityMs}`);

  if (!hasSlot) {
    throw new AppError(
      "Слот уже занят. Обновите расписание и выберите другое время.",
      409,
      "SLOT_CONFLICT"
    );
  }

  const hotProviderId = resolvedMasterProviderId ?? (provider.type === ProviderType.MASTER ? provider.id : null);
  if (hotProviderId) {
    const rule = await prisma.discountRule.findUnique({
      where: { providerId: hotProviderId },
      select: { isEnabled: true, applyMode: true, minPriceFrom: true, serviceIds: true },
    });
    const isEligible = isServiceEligibleForHotRule(rule, service.id, service.price);
    if (isEligible) {
      const hotSlot = await prisma.hotSlot.findFirst({
        where: {
          providerId: hotProviderId,
          startAtUtc,
          isActive: true,
          expiresAtUtc: { gt: new Date() },
          OR: [{ endAtUtc }, { serviceId: null }],
        },
        select: { id: true },
      });
      if (hotSlot) {
        const cutoff = new Date(startAtUtc.getTime() - HOT_SLOT_REBOOK_BLOCK_HOURS * 60 * 60 * 1000);
        const recentCancel = await prisma.booking.findFirst({
          where: {
            providerId: input.providerId,
            clientUserId: input.clientUserId,
            status: { in: ["REJECTED", "CANCELLED"] },
            startAtUtc,
            cancelledAtUtc: { gt: cutoff },
          },
          select: { id: true, cancelledAtUtc: true },
        });
        if (recentCancel && isHotSlotRebookBlocked(recentCancel.cancelledAtUtc, startAtUtc)) {
          throw new AppError(
            "Нельзя повторно записаться на этот слот со скидкой после отмены. Выберите другое время.",
            409,
            "BOOKING_CONFLICT"
          );
        }
      }
    }
  }

  const bufferSource =
    resolvedMasterProviderId && resolvedMasterProviderId !== provider.id
      ? master?.bufferBetweenBookingsMin
      : provider.bufferBetweenBookingsMin;
  const bufferMin = normalizeBufferMinutes(bufferSource);

  await ensureNoConflicts(prisma, {
    providerId: input.providerId,
    masterProviderId: resolvedMasterProviderId,
    startAtUtc,
    endAtUtc,
    bufferMin,
  });

  const shouldAutoConfirm =
    provider.type === ProviderType.MASTER && !provider.studioId && provider.autoConfirmBookings;

  const transactionStartedAt = Date.now();
  const created = await prisma.$transaction(
    async (tx) => {
      await ensureNoConflicts(tx, {
        providerId: input.providerId,
        masterProviderId: resolvedMasterProviderId,
        startAtUtc,
        endAtUtc,
        bufferMin,
      });

      return tx.booking.create({
        data: {
          providerId: input.providerId,
          serviceId: service.id,
          masterProviderId: resolvedMasterProviderId,
          masterId: resolvedMasterProviderId,
          startAtUtc,
          endAtUtc,
          startAt: startAtUtc,
          endAt: endAtUtc,
          slotLabel: input.slotLabel,
          clientName: input.clientName,
          clientPhone: input.clientPhone,
          comment: input.comment,
          silentMode: input.silentMode ?? false,
          clientUserId: input.clientUserId,
          status: shouldAutoConfirm ? "CONFIRMED" : "PENDING",
          actionRequiredBy: shouldAutoConfirm ? null : "MASTER",
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
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  const transactionMs = Date.now() - transactionStartedAt;
  console.info(`[booking:create] transaction ms=${transactionMs}`);

  let notifications: NotificationRecord[] = [];
  const snapshotStartedAt = Date.now();
  try {
    const snapshot = await loadBookingSnapshot(created.id);
    const snapshotMs = Date.now() - snapshotStartedAt;
    console.info(`[booking:create] snapshot ms=${snapshotMs}`);
    if (snapshot) {
      notifications = shouldAutoConfirm
        ? await createBookingConfirmedNotifications({
            bookingId: created.id,
            notifyClient: true,
            notifyMaster: true,
            masterMode: "AUTO",
            snapshot,
          })
        : await createBookingRequestNotifications({ bookingId: created.id, snapshot });
    }
  } catch (error) {
    console.error("Не удалось создать уведомления по записи:", error);
  }

  if (notifications.length > 0) {
    publishNotifications(notifications);
  }

  try {
    await sendBookingTelegramNotifications(created.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    console.error("Не удалось отправить Telegram-уведомления о записи:", error);
  }

  await invalidateSlotsForBookingRange({
    providerId: created.providerId,
    masterProviderId: created.masterProviderId ?? null,
    startAtUtc: created.startAtUtc,
    endAtUtc: created.endAtUtc,
  });

  return toBookingDto(created);
}
