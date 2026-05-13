import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { MediaEntityType, ProviderType, Prisma } from "@prisma/client";
import { checkRateLimit } from "@/lib/rate-limit";
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
import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";
import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";
import { resolveDynamicHotSlotPricing } from "@/lib/hot-slots/runtime";
import { logInfo, logError } from "@/lib/logging/logger";
import { scheduleBookingReminders } from "@/lib/bookings/reminders";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { resolveBookingExtras, type BookingAnswerPayload } from "@/lib/bookings/booking-extras";
import { emitBookingCreatedSystemMessage } from "@/lib/chat/system-messages";

function mapPrismaBookingConflict(error: unknown): AppError | null {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002" || error.code === "P2034") {
      return new AppError(
        "Это время уже занято. Пожалуйста, выберите другое окошко.",
        409,
        "BOOKING_CONFLICT"
      );
    }
  }
  return null;
}

export async function createBooking(input: {
  providerId: string;
  serviceId: string;
  masterProviderId: string | null;
  hotSlotId?: string | null;
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
      master,
      resolvedMasterProviderId,
      durationMin,
      startAtUtc,
      endAtUtc,
      bufferMin,
      shouldAutoConfirm,
    } = await resolveBookingCore({
      providerId: input.providerId,
      serviceId: input.serviceId,
      masterProviderId: input.masterProviderId ?? null,
      clientUserId: input.clientUserId,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
    });

  const bookingExtras = await resolveBookingExtras({
    serviceId: service.id,
    clientUserId: input.clientUserId,
    referencePhotoAssetId: input.referencePhotoAssetId ?? null,
    bookingAnswers: input.bookingAnswers ?? null,
  });
  let bookedServicePrice = service.effectivePrice;

  const hotProviderId = resolvedMasterProviderId ?? (provider.type === ProviderType.MASTER ? provider.id : null);
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
    if (input.hotSlotId && !hotPricing.isHot) {
      throw new AppError("Selected hot slot is no longer available.", 409, "BOOKING_CONFLICT");
    }
    if (hotPricing.isHot && hotPricing.discountedPrice !== null) {
      bookedServicePrice = hotPricing.discountedPrice;
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
          "Cannot rebook the same discounted hot slot after cancellation. Please choose another time.",
          409,
          "BOOKING_CONFLICT"
        );
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
  let created;
  try {
    created = await prisma.$transaction(
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
            masterId: resolvedMasterProviderId ?? provider.id,
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
  logInfo("[booking:create] transaction complete", { transactionMs });
  createdBookingId = created.id;

  if (idempotencyKey && idempotencyLockAcquired) {
    await storeBookingIdempotency({
      key: idempotencyKey,
      bookingId: created.id,
      ttlSeconds: CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
    });
  }

  if (shouldAutoConfirm) {
    await scheduleBookingReminders(created.id);
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

  // Emit the BOOKING_CREATED system message into the chat. Idempotent via
  // (referencedBookingId, systemEventKey) unique constraint, so safe across
  // retries. Failures are non-fatal — chat decoration shouldn't block the
  // booking response.
  try {
    await emitBookingCreatedSystemMessage(created.id);
  } catch (error) {
    logError("Failed to emit booking system message (create)", {
      bookingId: created.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return toBookingDto(created);
  } catch (error) {
    if (idempotencyKey && idempotencyLockAcquired && !createdBookingId) {
      await clearBookingIdempotency(idempotencyKey);
    }
    throw error;
  }
}

