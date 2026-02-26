import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { MediaEntityType, ProviderType, Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rateLimit/rateLimiter";
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
import { ensureNoConflicts, resolveBookingCore } from "@/lib/bookings/booking-core";
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
import { scheduleBookingReminders } from "@/lib/bookings/reminders";
import { logError, logInfo } from "@/lib/logging/logger";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { resolveBookingExtras, type BookingAnswerPayload } from "@/lib/bookings/booking-extras";

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
  referencePhotoAssetId?: string | null;
  bookingAnswers?: BookingAnswerPayload[] | null;
  clientUserId: string;
  idempotencyKey?: string | null;
}): Promise<BookingDto> {
  let idempotencyKey: string | null = null;
  let idempotencyLockAcquired = false;
  if (input.idempotencyKey) {
    const key = buildCreateBookingIdempotencyKey(input.clientUserId, input.idempotencyKey);
    const idempotency = await resolveBookingIdempotency({
      key,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
      userId: input.clientUserId,
    });
    if (idempotency.booking) return idempotency.booking;
    if (!idempotency.lockAcquired) {
      throw new AppError("Повторный запрос.", 409, "DUPLICATE_REQUEST");
    }
    idempotencyKey = key;
    idempotencyLockAcquired = true;
  }

  let createdBookingId: string | null = null;
  try {
    const allowed = await checkRateLimit(
      `rate:createBooking:${input.clientUserId}`,
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
      providerId: input.providerId,
      serviceId: input.serviceId,
      masterProviderId: input.masterProviderId ?? null,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
    });

  const bookingExtras = await resolveBookingExtras({
    serviceId: service.id,
    clientUserId: input.clientUserId,
    referencePhotoAssetId: input.referencePhotoAssetId ?? null,
    bookingAnswers: input.bookingAnswers ?? null,
  });

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

  await ensureNoConflicts(prisma, {
    providerId: input.providerId,
    masterProviderId: resolvedMasterProviderId,
    startAtUtc,
    endAtUtc,
    bufferMin,
  });

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

      const created = await tx.booking.create({
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
          referencePhotoAssetId: bookingExtras.referencePhotoAssetId,
          bookingAnswers: bookingExtras.bookingAnswers ?? undefined,
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

      if (bookingExtras.referencePhotoAssetId) {
        await tx.mediaAsset.update({
          where: { id: bookingExtras.referencePhotoAssetId },
          data: {
            entityType: MediaEntityType.BOOKING,
            entityId: created.id,
          },
        });
      }

      return created;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
  );
  const transactionMs = Date.now() - transactionStartedAt;
  logInfo("[booking:create] transaction complete", { transactionMs });
  createdBookingId = created.id;

  if (idempotencyKey && idempotencyLockAcquired) {
    await storeBookingIdempotency({
      key: idempotencyKey,
      bookingId: created.id,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
    });
  }

  let notifications: NotificationRecord[] = [];
  const snapshotStartedAt = Date.now();
  try {
    const snapshot = await loadBookingSnapshot(created.id);
    const snapshotMs = Date.now() - snapshotStartedAt;
    logInfo("[booking:create] snapshot loaded", { snapshotMs });
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
    logError("Не удалось создать уведомления по записи", {
      error: error instanceof Error ? error.stack : String(error),
    });
  }

  if (notifications.length > 0) {
    publishNotifications(notifications);
  }

  try {
    await sendBookingTelegramNotifications(created.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    logError("Не удалось отправить Telegram-уведомления о записи", {
      error: error instanceof Error ? error.stack : String(error),
    });
  }

  if (shouldAutoConfirm) {
    try {
      await scheduleBookingReminders(created.id);
    } catch (error) {
      logError("Failed to schedule booking reminders", {
        bookingId: created.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  await invalidateSlotsForBookingRange({
    providerId: created.providerId,
    masterProviderId: created.masterProviderId ?? null,
    startAtUtc: created.startAtUtc,
    endAtUtc: created.endAtUtc,
  });

  const advisorMasterId =
    resolvedMasterProviderId ?? (provider.type === ProviderType.MASTER ? provider.id : null);
  if (advisorMasterId) {
    await invalidateAdvisorCache(advisorMasterId);
  }

  return toBookingDto(created);
  } catch (error) {
    if (idempotencyKey && idempotencyLockAcquired && !createdBookingId) {
      await clearBookingIdempotency(idempotencyKey);
    }
    throw error;
  }
}
