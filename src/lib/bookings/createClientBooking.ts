import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import {
  createBookingConfirmedNotifications,
  createBookingRequestNotifications,
  loadBookingSnapshot,
  publishNotifications,
  type NotificationRecord,
} from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import { scheduleBookingReminders } from "@/lib/bookings/reminders";
import { logError, logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rateLimit/rateLimiter";
import { ProviderType, Prisma } from "@prisma/client";
import { CREATE_BOOKING_RATE_LIMIT } from "@/lib/bookings/rateLimit";
import {
  buildCreateBookingIdempotencyKey,
  CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
  clearBookingIdempotency,
  resolveBookingIdempotency,
  storeBookingIdempotency,
} from "@/lib/bookings/idempotency";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";
import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";
import { ensureNoConflicts, resolveBookingCore } from "@/lib/bookings/booking-core";

export async function createClientBooking(
  userId: string,
  data: {
    providerId: string;
    serviceId: string;
    slotLabel: string;
    clientName: string;
    clientPhone: string;
    comment: string | null | undefined;
    silentMode?: boolean;
  },
  idempotencyKey?: string | null
): Promise<BookingDto> {
  // AUDIT (создание записи):
  // - реализовано: создаётся PENDING + actionRequiredBy=MASTER.
  // - исправлено после аудита: startAtUtc/endAtUtc теперь вычисляются из slotLabel + timezone.
  // - реализовано частично: legacy path мягче по проверкам конфликтов, чем createBooking().
  let resolvedIdempotencyKey: string | null = null;
  let idempotencyLockAcquired = false;
  if (idempotencyKey) {
    const key = buildCreateBookingIdempotencyKey(userId, idempotencyKey);
    const idempotency = await resolveBookingIdempotency({
      key,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
      userId,
    });
    if (idempotency.booking) return idempotency.booking;
    if (!idempotency.lockAcquired) {
      throw new AppError("Повторный запрос.", 409, "DUPLICATE_REQUEST");
    }
    resolvedIdempotencyKey = key;
    idempotencyLockAcquired = true;
  }

  let createdBookingId: string | null = null;
  try {
    const allowed = await checkRateLimit(
      `rate:createBooking:${userId}`,
      CREATE_BOOKING_RATE_LIMIT.limit,
      CREATE_BOOKING_RATE_LIMIT.windowSeconds
    );
    if (!allowed) {
      throw new AppError("Слишком много запросов. Попробуйте позже.", 429, "RATE_LIMITED");
    }

    const {
      provider,
      service,
      resolvedMasterProviderId,
      startAtUtc,
      endAtUtc,
      bufferMin,
      shouldAutoConfirm,
    } = await resolveBookingCore({
      providerId: data.providerId,
      serviceId: data.serviceId,
      masterProviderId: null,
      slotLabel: data.slotLabel,
    });

  const hotProviderId = provider.type === ProviderType.MASTER ? provider.id : resolvedMasterProviderId;
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
            providerId: data.providerId,
            clientUserId: userId,
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

    await ensureNoConflicts(prisma, {
      providerId: data.providerId,
      masterProviderId: resolvedMasterProviderId,
      startAtUtc,
      endAtUtc,
      bufferMin,
    });

    const transactionStartedAt = Date.now();
    const booking = await prisma.$transaction(
      async (tx) => {
        await ensureNoConflicts(tx, {
          providerId: data.providerId,
          masterProviderId: resolvedMasterProviderId,
          startAtUtc,
          endAtUtc,
          bufferMin,
        });

        return tx.booking.create({
          data: {
            providerId: data.providerId,
            serviceId: data.serviceId,
            masterProviderId: resolvedMasterProviderId,
            masterId: resolvedMasterProviderId,
            startAtUtc,
            endAtUtc,
            startAt: startAtUtc,
            endAt: endAtUtc,
            slotLabel: data.slotLabel,
            clientName: data.clientName,
            clientPhone: data.clientPhone,
            comment: data.comment,
            silentMode: data.silentMode ?? false,
            clientUserId: userId,
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
  logInfo("[booking:create:legacy] transaction complete", { transactionMs });
  createdBookingId = booking.id;

  if (resolvedIdempotencyKey && idempotencyLockAcquired) {
    await storeBookingIdempotency({
      key: resolvedIdempotencyKey,
      bookingId: booking.id,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
    });
  }

  let notifications: NotificationRecord[] = [];
  const snapshotStartedAt = Date.now();
  try {
    const snapshot = await loadBookingSnapshot(booking.id);
    const snapshotMs = Date.now() - snapshotStartedAt;
    logInfo("[booking:create:legacy] snapshot loaded", { snapshotMs });
    if (snapshot) {
      notifications = shouldAutoConfirm
        ? await createBookingConfirmedNotifications({
            bookingId: booking.id,
            notifyClient: true,
            notifyMaster: true,
            masterMode: "AUTO",
            snapshot,
          })
        : await createBookingRequestNotifications({ bookingId: booking.id, snapshot });
    }
  } catch (error) {
    logError("Не удалось создать уведомления по записи", {
      error: error instanceof Error ? error.stack : String(error),
    });
  }

  if (notifications.length > 0) {
    publishNotifications(notifications);
  }

  try {
    await sendBookingTelegramNotifications(booking.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    logError("Не удалось отправить Telegram-уведомления о записи", {
      error: error instanceof Error ? error.stack : String(error),
    });
  }

  if (shouldAutoConfirm) {
    try {
      await scheduleBookingReminders(booking.id);
    } catch (error) {
      logError("Failed to schedule booking reminders", {
        bookingId: booking.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await invalidateSlotsForBookingRange({
    providerId: booking.providerId,
    masterProviderId: booking.masterProviderId ?? null,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  return toBookingDto(booking);
  } catch (error) {
    if (resolvedIdempotencyKey && idempotencyLockAcquired && !createdBookingId) {
      await clearBookingIdempotency(resolvedIdempotencyKey);
    }
    throw error;
  }
}
