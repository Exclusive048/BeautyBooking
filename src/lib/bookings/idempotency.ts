import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { BookingDto } from "@/lib/bookings/dto";
import { toBookingDto } from "@/lib/bookings/mappers";
import {
  clearIdempotency,
  getIdempotencyRecord,
  setIdempotencyPending,
  setIdempotencyResult,
  type IdempotencyRecord,
} from "@/lib/idempotency/idempotency";

export const CREATE_BOOKING_IDEMPOTENCY_TTL_SECONDS = 600;

export function buildCreateBookingIdempotencyKey(userId: string, requestId: string): string {
  return `idempotency:createBooking:${userId}:${requestId}`;
}

const bookingSelect = {
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
} satisfies Prisma.BookingSelect;

async function loadBookingForIdempotency(
  userId: string,
  bookingId: string
): Promise<BookingDto | null> {
  const booking = await prisma.booking.findFirst({
    where: { id: bookingId, clientUserId: userId },
    select: bookingSelect,
  });
  return booking ? toBookingDto(booking) : null;
}

async function waitForIdempotencyResult(
  key: string,
  userId: string
): Promise<BookingDto | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await getIdempotencyRecord(key);
    if (current?.status === "done") {
      const booking = await loadBookingForIdempotency(userId, current.bookingId);
      if (booking) return booking;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return null;
}

export async function resolveBookingIdempotency(input: {
  key: string;
  ttlSeconds: number;
  userId: string;
}): Promise<{ booking: BookingDto | null; lockAcquired: boolean }> {
  const existing = await getIdempotencyRecord(input.key);
  if (existing?.status === "done") {
    return {
      booking: await loadBookingForIdempotency(input.userId, existing.bookingId),
      lockAcquired: false,
    };
  }
  if (existing?.status === "pending") {
    return { booking: await waitForIdempotencyResult(input.key, input.userId), lockAcquired: false };
  }

  const acquired = await setIdempotencyPending(input.key, input.ttlSeconds);
  if (!acquired) {
    const booking = await waitForIdempotencyResult(input.key, input.userId);
    return { booking, lockAcquired: false };
  }

  return { booking: null, lockAcquired: true };
}

export async function storeBookingIdempotency(input: {
  key: string;
  bookingId: string;
  ttlSeconds: number;
}): Promise<void> {
  await setIdempotencyResult(input.key, input.bookingId, input.ttlSeconds);
}

export async function clearBookingIdempotency(key: string): Promise<void> {
  await clearIdempotency(key);
}

export type { IdempotencyRecord };
