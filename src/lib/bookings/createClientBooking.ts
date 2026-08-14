import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { scheduleBookingRemindersSafe } from "@/lib/bookings/reminders";
import { logInfo } from "@/lib/logging/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveRateLimitRefusal } from "@/lib/rate-limit/refusal";
import { BookingSource, MediaEntityType, ProviderType, Prisma } from "@prisma/client";
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
import { createBookingRow } from "@/lib/bookings/booking-row";
import { bookingTransaction } from "@/lib/bookings/booking-transaction";
import { resolveBookingServicePrice } from "@/lib/bookings/hot-slot-pricing";
import { invalidateAdvisorCache } from "@/lib/advisor/cache";
import { resolveBookingExtras, type BookingAnswerPayload } from "@/lib/bookings/booking-extras";

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
    // FIX-C11: как в `createBooking` — причина отказа различима (503 против 429).
    const refusal = resolveRateLimitRefusal(
      await checkRateLimit(`rate:createBooking:${userId}`, {
        maxRequests: CREATE_BOOKING_RATE_LIMIT.limit,
        windowSeconds: CREATE_BOOKING_RATE_LIMIT.windowSeconds,
      })
    );
    if (refusal) {
      throw new AppError(refusal.message, refusal.status, refusal.code);
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
    // FIX-C1 (фаза 3): та же одна функция, что и на основном пути, — вторая
    // копия анти-фрода жила здесь.
    const bookedServicePrice = await resolveBookingServicePrice({
      providerId: data.providerId,
      providerType: provider.type,
      resolvedMasterProviderId,
      clientUserId: userId,
      serviceId: service.id,
      basePrice: service.effectivePrice,
      startAtUtc,
      providerTimeZone: master?.timezone ?? provider.timezone,
      hotSlotRequested: Boolean(data.hotSlotId),
    });

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
      booking = await bookingTransaction(
        async (tx) => {
          await ensureNoConflicts(tx, {
            providerId: data.providerId,
            masterProviderId: resolvedMasterProviderId,
            startAtUtc,
            endAtUtc,
            bufferMin,
          });

          const created = await createBookingRow(tx, {
            data: {
              providerId: data.providerId,
              serviceId: data.serviceId,
              masterProviderId: resolvedMasterProviderId,
              masterId: resolvedMasterProviderId ?? provider.id,
              startAtUtc,
              endAtUtc,
              slotLabel: data.slotLabel,
              clientName: data.clientName,
              clientPhone: data.clientPhone,
              comment: data.comment,
              silentMode: data.silentMode ?? false,
              referencePhotoAssetId: bookingExtras.referencePhotoAssetId,
              bookingAnswers: bookingExtras.bookingAnswers ?? undefined,
              clientUserId: userId,
              // Тот же путь записи клиентом, что и `createBooking` — легаси-ветка
              // отличается только тем, что время приходит `slotLabel`-ом.
              source: BookingSource.WEB,
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
        // FIX-C6: изоляцию ставит `bookingTransaction` (инв. #31).
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
      await scheduleBookingRemindersSafe(booking.id);
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

