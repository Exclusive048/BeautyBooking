import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import { createBookingNotifications } from "@/lib/notifications/service";
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

export async function createClientBooking(
  userId: string,
  data: {
    providerId: string;
    serviceId: string;
    slotLabel: string;
    clientName: string;
    clientPhone: string;
    comment: string | null | undefined;
  },
  idempotencyKey?: string | null
): Promise<BookingDto> {
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
      select: { id: true, providerId: true, name: true },
    }),
    prisma.provider.findUnique({
      where: { id: data.providerId },
      select: { id: true, type: true },
    }),
  ]);

  if (!provider) {
    throw new AppError("Provider not found", 404, "PROVIDER_NOT_FOUND");
  }

  if (!service || service.providerId !== data.providerId) {
    throw new AppError("Service does not belong to provider", 400, "SERVICE_NOT_BELONGS_TO_PROVIDER");
  }

  const resolvedMasterProviderId = provider.type === ProviderType.MASTER ? provider.id : null;

  const booking = await prisma.booking.create({
    data: {
      providerId: data.providerId,
      serviceId: data.serviceId,
      masterProviderId: resolvedMasterProviderId,
      masterId: resolvedMasterProviderId,
      slotLabel: data.slotLabel,
      clientName: data.clientName,
      clientPhone: data.clientPhone,
      comment: data.comment,
      clientUserId: userId,
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
    await createBookingNotifications({ bookingId: booking.id, kind: "CREATED" });
  } catch (error) {
    console.error("Failed to create booking notifications:", error);
  }

  try {
    await sendBookingTelegramNotifications(booking.id, "CREATED", { notifyClientOnCreate: true });
  } catch (error) {
    console.error("Failed to send Telegram booking notifications:", error);
  }

  return toBookingDto(booking);
}
