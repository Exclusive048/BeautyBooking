import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { scheduleBookingReminders } from "@/lib/bookings/reminders";
import { logInfo } from "@/lib/logging/logger";
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
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { ensureNoConflicts, resolveBookingCore } from "@/lib/bookings/booking-core";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { resolveBookingExtras, type BookingAnswerPayload } from "@/lib/bookings/booking-extras";

function mapPrismaBookingConflict(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new AppError(
        "Это время уже занято. Пожалуйста, выберите другой слот.",
        409,
        "BOOKING_CONFLICT"
      );
    }
  }
  return null;
}

export async function createClientBooking(
  userId: string,
  data: {
    providerId: string;
    serviceId: string;
    hotSlotId?: string | null;
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
      master,
      resolvedMasterProviderId,
      durationMin,
      startAtUtc,
      endAtUtc,
      bufferMin,
      shouldAutoConfirm,
    } = await resolveBookingCore({
      providerId: data.providerId,
      serviceId: data.serviceId,
      masterProviderId: null,
      clientUserId: userId,
      slotLabel: data.slotLabel,
    });

    const bookingExtras = await resolveBookingExtras({
      serviceId: service.id,
      clientUserId: userId,
      referencePhotoAssetId: data.referencePhotoAssetId ?? null,
      bookingAnswers: data.bookingAnswers ?? null,
    });
    let bookedServicePrice = service.effectivePrice;

    const hotProviderId = provider.type === ProviderType.MASTER ? provider.id : resolvedMasterProviderId;
    if (hotProviderId) {
      const rule = await prisma.discountRule.findUnique({
        where: { providerId: hotProviderId },
        select: {
          isEnabled: true,
          triggerHours: true,
          discountType: true,
          discountValue: true,
          applyMode: true,
          minPriceFrom: true,
          serviceIds: true,
        },
      });
      const now = new Date();
      const hotPricing = resolveDynamicHotSlotPricing({
        rule,
        slotStartAtUtc: startAtUtc,
        serviceId: service.id,
        servicePrice: service.effectivePrice,
        providerTimeZone: master?.timezone ?? provider.timezone,
        now,
      });
      if (data.hotSlotId && !hotPricing.isHot) {
        throw new AppError("Selected hot slot is no longer available.", 409, "BOOKING_CONFLICT");
      }
      if (hotPricing.isHot && hotPricing.discountedPrice !== null) {
        bookedServicePrice = hotPricing.discountedPrice;
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
            "Cannot rebook the same discounted hot slot after cancellation. Please choose another time.",
            409,
            "BOOKING_CONFLICT"
          );
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
    let booking;
    try {
      booking = await prisma.$transaction(
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
              masterId: resolvedMasterProviderId ?? provider.id,
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

          await tx.bookingServiceItem.create({
            data: {
              bookingId: created.id,
              serviceId: service.id,
              titleSnapshot: service.title?.trim() || service.name,
              priceSnapshot: bookedServicePrice,
              durationSnapshotMin: durationMin,
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
    } catch (error) {
      const conflictError = mapPrismaBookingConflict(error);
      if (conflictError) throw conflictError;
      throw error;
    }
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

    if (shouldAutoConfirm) {
      await scheduleBookingReminders(booking.id);
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

