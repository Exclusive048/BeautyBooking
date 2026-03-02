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
import { checkRateLimit } from "@/lib/rate-limit";
import { MediaEntityType, ProviderType, Prisma } from "@prisma/client";
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
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { resolveBookingExtras, type BookingAnswerPayload } from "@/lib/bookings/booking-extras";

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
    referencePhotoAssetId?: string | null;
    bookingAnswers?: BookingAnswerPayload[] | null;
  },
  idempotencyKey?: string | null
): Promise<BookingDto> {
  // AUDIT (СЃРѕР·РґР°РЅРёРµ Р·Р°РїРёСЃРё):
  // - СЂРµР°Р»РёР·РѕРІР°РЅРѕ: СЃРѕР·РґР°С‘С‚СЃСЏ PENDING + actionRequiredBy=MASTER.
  // - РёСЃРїСЂР°РІР»РµРЅРѕ РїРѕСЃР»Рµ Р°СѓРґРёС‚Р°: startAtUtc/endAtUtc С‚РµРїРµСЂСЊ РІС‹С‡РёСЃР»СЏСЋС‚СЃСЏ РёР· slotLabel + timezone.
  // - СЂРµР°Р»РёР·РѕРІР°РЅРѕ С‡Р°СЃС‚РёС‡РЅРѕ: legacy path РјСЏРіС‡Рµ РїРѕ РїСЂРѕРІРµСЂРєР°Рј РєРѕРЅС„Р»РёРєС‚РѕРІ, С‡РµРј createBooking().
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
      throw new AppError("РџРѕРІС‚РѕСЂРЅС‹Р№ Р·Р°РїСЂРѕСЃ.", 409, "DUPLICATE_REQUEST");
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
      throw new AppError("РЎР»РёС€РєРѕРј РјРЅРѕРіРѕ Р·Р°РїСЂРѕСЃРѕРІ. РџРѕРїСЂРѕР±СѓР№С‚Рµ РїРѕР·Р¶Рµ.", 429, "RATE_LIMITED");
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

    const bookingExtras = await resolveBookingExtras({
      serviceId: service.id,
      clientUserId: userId,
      referencePhotoAssetId: data.referencePhotoAssetId ?? null,
      bookingAnswers: data.bookingAnswers ?? null,
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
              "РќРµР»СЊР·СЏ РїРѕРІС‚РѕСЂРЅРѕ Р·Р°РїРёСЃР°С‚СЊСЃСЏ РЅР° СЌС‚РѕС‚ СЃР»РѕС‚ СЃРѕ СЃРєРёРґРєРѕР№ РїРѕСЃР»Рµ РѕС‚РјРµРЅС‹. Р’С‹Р±РµСЂРёС‚Рµ РґСЂСѓРіРѕРµ РІСЂРµРјСЏ.",
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

        const created = await tx.booking.create({
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
            referencePhotoAssetId: bookingExtras.referencePhotoAssetId,
            bookingAnswers: bookingExtras.bookingAnswers ?? undefined,
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
      logError("РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР·РґР°С‚СЊ СѓРІРµРґРѕРјР»РµРЅРёСЏ РїРѕ Р·Р°РїРёСЃРё", {
        error: error instanceof Error ? error.stack : String(error),
      });
    }

    if (notifications.length > 0) {
      publishNotifications(notifications);
    }

    try {
      await sendBookingTelegramNotifications(booking.id, "CREATED", { notifyClientOnCreate: true });
    } catch (error) {
      logError("РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚РїСЂР°РІРёС‚СЊ Telegram-СѓРІРµРґРѕРјР»РµРЅРёСЏ Рѕ Р·Р°РїРёСЃРё", {
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

    const advisorMasterId =
      resolvedMasterProviderId ?? (provider.type === ProviderType.MASTER ? provider.id : null);
    if (advisorMasterId) {
      await invalidateAdvisorCache(advisorMasterId);
    }

    return toBookingDto(booking);
  } catch (error) {
    if (resolvedIdempotencyKey && idempotencyLockAcquired && !createdBookingId) {
      await clearBookingIdempotency(resolvedIdempotencyKey);
    }
    throw error;
  }
}
