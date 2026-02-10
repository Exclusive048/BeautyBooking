import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import {
  createBookingConfirmedNotifications,
  createBookingRequestNotifications,
  publishNotifications,
  type NotificationRecord,
} from "@/lib/notifications/service";
import { sendBookingTelegramNotifications } from "@/lib/notifications/bookingTelegramService";
import { checkRateLimit } from "@/lib/rateLimit/rateLimiter";
import { ProviderType } from "@prisma/client";
import { CREATE_BOOKING_RATE_LIMIT } from "@/lib/bookings/rateLimit";
import { checkAndSetIdempotency } from "@/lib/idempotency/idempotency";
import {
  buildCreateBookingIdempotencyKey,
  CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS,
} from "@/lib/bookings/idempotency";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";
import { dateFromKey } from "@/lib/schedule/time";
import { toUtcFromLocalDateTime } from "@/lib/schedule/timezone";
import { invalidateSlotsForBookingRange } from "@/lib/bookings/slot-invalidation";
import { isHotSlotRebookBlocked } from "@/lib/hot-slots/anti-fraud";
import { HOT_SLOT_REBOOK_BLOCK_HOURS } from "@/lib/hot-slots/constants";
import { isServiceEligibleForHotRule } from "@/lib/hot-slots/eligibility";

function parseSlotStartAtUtc(slotLabel: string, timezone: string): Date | null {
  const normalized = slotLabel.trim();
  const direct = new Date(normalized);
  if (!Number.isNaN(direct.getTime())) {
    return direct;
  }

  const match = /^(\d{4}-\d{2}-\d{2})\s+([01]\d|2[0-3]):([0-5]\d)$/.exec(normalized);
  if (!match) return null;

  const date = dateFromKey(match[1]);
  if (!date) return null;

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  return toUtcFromLocalDateTime(date, hours, minutes, timezone);
}

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
  if (idempotencyKey) {
    const key = buildCreateBookingIdempotencyKey(userId, idempotencyKey);
    const allowed = await checkAndSetIdempotency(
      key,
      CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS
    );
    if (!allowed) {
      throw new AppError("Duplicate request", 409, "DUPLICATE_REQUEST");
    }
  }

  const allowed = await checkRateLimit(
    `rate:createBooking:${userId}`,
    CREATE_BOOKING_RATE_LIMIT.limit,
    CREATE_BOOKING_RATE_LIMIT.windowSeconds
  );
  if (!allowed) {
    throw new AppError("Rate limit exceeded", 429, "RATE_LIMITED");
  }

  const [service, provider] = await Promise.all([
    prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { id: true, providerId: true, name: true, durationMin: true, price: true },
    }),
    prisma.provider.findUnique({
      where: { id: data.providerId },
      select: { id: true, type: true, timezone: true, studioId: true, autoConfirmBookings: true },
    }),
  ]);

  if (!provider) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  if (!service || service.providerId !== data.providerId) {
    throw new AppError("Service does not belong to provider", 400, "SERVICE_NOT_BELONGS_TO_PROVIDER");
  }

  const resolvedMasterProviderId = provider.type === ProviderType.MASTER ? provider.id : null;
  const startAtUtc = parseSlotStartAtUtc(data.slotLabel, provider.timezone);
  if (!startAtUtc) {
    throw new AppError("Invalid slot label", 400, "DATE_INVALID");
  }
  const endAtUtc = new Date(startAtUtc.getTime() + service.durationMin * 60 * 1000);

  const shouldAutoConfirm =
    provider.type === ProviderType.MASTER && !provider.studioId && provider.autoConfirmBookings;

  const { booking, notifications } = await prisma.$transaction(async (tx) => {
    const hotProviderId = provider.type === ProviderType.MASTER ? provider.id : resolvedMasterProviderId;
    if (hotProviderId) {
      const rule = await tx.discountRule.findUnique({
        where: { providerId: hotProviderId },
        select: { isEnabled: true, applyMode: true, minPriceFrom: true, serviceIds: true },
      });
      const isEligible = isServiceEligibleForHotRule(rule, service.id, service.price);
      if (isEligible) {
        const hotSlot = await tx.hotSlot.findFirst({
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
          const recentCancel = await tx.booking.findFirst({
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

    let notifications: NotificationRecord[] = [];
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
      console.error("Failed to create booking notifications:", error);
    }

    return { booking: created, notifications };
  });

  if (notifications.length > 0) {
    publishNotifications(notifications);
  }

  try {
    await sendBookingTelegramNotifications(booking.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    console.error("Failed to send Telegram booking notifications:", error);
  }

  await invalidateSlotsForBookingRange({
    providerId: booking.providerId,
    masterProviderId: booking.masterProviderId ?? null,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  return toBookingDto(booking);
}
