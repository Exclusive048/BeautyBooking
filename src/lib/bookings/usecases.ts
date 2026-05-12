import { prisma } from "@/lib/prisma";
import type { Result } from "@/lib/domain/result";
import { toBookingDto } from "@/lib/bookings/mappers";
import type { BookingDto } from "@/lib/bookings/dto";
import {
  BOOKING_CHANGE_REQUEST_LIMIT,
  ensureBookingActionWindow,
  resolveBookingRuntimeStatus,
  type BookingActor,
} from "@/lib/bookings/flow";
import { invalidateSlotsForBookingMove } from "@/lib/bookings/slot-invalidation";

type RescheduleRecord = BookingDto;

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
}

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

async function ensureNoConflictsExcluding(
  bookingId: string,
  providerId: string,
  masterProviderId: string | null,
  startAtUtc: Date,
  endAtUtc: Date,
  bufferMin: number
): Promise<Result<null>> {
  const bufferedStart = bufferMin ? shiftMinutes(startAtUtc, -bufferMin) : startAtUtc;
  const bufferedEnd = bufferMin ? shiftMinutes(endAtUtc, bufferMin) : endAtUtc;

  const conflictWhere = masterProviderId
    ? { providerId, masterProviderId }
    : { providerId };

  const conflicts = await prisma.booking.findMany({
    where: {
      ...conflictWhere,
      id: { not: bookingId },
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
      startAtUtc: { not: null, lt: bufferedEnd },
      endAtUtc: { not: null, gt: bufferedStart },
    },
    select: { id: true, startAtUtc: true, endAtUtc: true },
    take: 1,
  });

  const conflict = conflicts.find((b) => {
    if (!b.startAtUtc || !b.endAtUtc) return false;
    const itemStart = bufferMin ? shiftMinutes(b.startAtUtc, -bufferMin) : b.startAtUtc;
    const itemEnd = bufferMin ? shiftMinutes(b.endAtUtc, bufferMin) : b.endAtUtc;
    return overlaps(startAtUtc, endAtUtc, itemStart, itemEnd);
  });

  if (conflict) {
    return { ok: false, status: 409, message: "Time slot is not available", code: "SLOT_CONFLICT" };
  }

  return { ok: true, data: null };
}

async function resolveBufferMinutes(
  providerId: string,
  masterProviderId: string | null
): Promise<number> {
  if (masterProviderId) {
    const master = await prisma.provider.findUnique({
      where: { id: masterProviderId },
      select: { bufferBetweenBookingsMin: true },
    });
    return normalizeBufferMinutes(master?.bufferBetweenBookingsMin);
  }

  const provider = await prisma.provider.findUnique({
    where: { id: providerId },
    select: { bufferBetweenBookingsMin: true },
  });
  return normalizeBufferMinutes(provider?.bufferBetweenBookingsMin);
}

export async function rescheduleBooking(input: {
  bookingId: string;
  actorUserId: string;
  actor: BookingActor;
  startAtUtc: Date;
  endAtUtc: Date;
  slotLabel: string;
  silentMode?: boolean;
  comment?: string;
}): Promise<Result<RescheduleRecord>> {
  // AUDIT (переносы):
  // - реализовано: только из PENDING/CONFIRMED, при CHANGE_REQUESTED повторный запрос блокируется.
  // - реализовано: лимит 3 запроса для CLIENT/MASTER, инкремент в момент CHANGE_REQUESTED.
  // - реализовано: actionRequiredBy/requestedBy выставляются по стороне запроса.
  // - реализовано: 60 минут проверяется на сервере через ensureBookingActionWindow.
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    select: {
      id: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      clientUserId: true,
      startAtUtc: true,
      endAtUtc: true,
      clientChangeRequestsCount: true,
      masterChangeRequestsCount: true,
    },
  });
  if (!booking) return { ok: false, status: 404, message: "Booking not found", code: "BOOKING_NOT_FOUND" };

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  if (runtimeStatus === "REJECTED") {
    return { ok: false, status: 409, message: "Booking cancelled", code: "BOOKING_CANCELLED" };
  }

  if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
    return { ok: false, status: 409, message: "Booking already started", code: "CONFLICT" };
  }

  if (runtimeStatus === "CHANGE_REQUESTED") {
    return {
      ok: false,
      status: 409,
      message: "Booking already has a pending change request",
      code: "CONFLICT",
    };
  }

  if (runtimeStatus !== "PENDING" && runtimeStatus !== "CONFIRMED") {
    return { ok: false, status: 409, message: "Booking cannot be rescheduled", code: "CONFLICT" };
  }

  // fix-04a: the previous master-only required-comment guard was
  // dropped. The Zod schema already marks `comment` as optional and
  // the UI labels it "(необязательно)" — enforcing it on the server
  // produced an API/UI contract violation where empty submits failed
  // with an English "Comment is required" leaking to the dialog.
  // When the master provides one it still flows into the
  // notification payload below; when empty, the generic
  // «Мастер перенёс запись...» body is used.

  if (typeof input.silentMode === "boolean") {
    if (input.actor !== "CLIENT" || !booking.clientUserId || booking.clientUserId !== input.actorUserId) {
      return { ok: false, status: 403, message: "Forbidden", code: "FORBIDDEN" };
    }
    if (runtimeStatus !== "PENDING") {
      return {
        ok: false,
        status: 409,
        message: "Silent mode can be changed only for pending bookings",
        code: "CONFLICT",
      };
    }
  }

  if (!isValidDate(input.startAtUtc) || !isValidDate(input.endAtUtc)) {
    return { ok: false, status: 400, message: "Invalid booking time", code: "DATE_INVALID" };
  }

  ensureBookingActionWindow(booking.startAtUtc);

  const bufferMin = await resolveBufferMinutes(booking.providerId, booking.masterProviderId);
  const conflict = await ensureNoConflictsExcluding(
    booking.id,
    booking.providerId,
    booking.masterProviderId ?? null,
    input.startAtUtc,
    input.endAtUtc,
    bufferMin
  );
  if (!conflict.ok) return conflict;

  if (input.actor === "CLIENT" && booking.clientChangeRequestsCount >= BOOKING_CHANGE_REQUEST_LIMIT) {
    return {
      ok: false,
      status: 409,
      message: "Client change request limit reached",
      code: "CONFLICT",
    };
  }

  if (input.actor === "MASTER" && booking.masterChangeRequestsCount >= BOOKING_CHANGE_REQUEST_LIMIT) {
    return {
      ok: false,
      status: 409,
      message: "Master change request limit reached",
      code: "CONFLICT",
    };
  }

  // fix-04a: dropped the CONFIRMED-only restriction for masters.
  // The earlier rule produced "Это время занято" in the schedule UI
  // for every PENDING booking the master tried to reschedule —
  // because the client modal mapped *every* 409 to that friendly
  // message, swallowing the real "only for confirmed" reason. Masters
  // legitimately need to nudge clients toward a workable time on
  // pending bookings (the status validation up at line 148 still
  // bounds the action to PENDING/CONFIRMED).

  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      status: "CHANGE_REQUESTED",
      proposedStartAt: input.startAtUtc,
      proposedEndAt: input.endAtUtc,
      requestedBy: input.actor,
      actionRequiredBy: input.actor === "CLIENT" ? "MASTER" : "CLIENT",
      changeComment:
        input.actor === "MASTER" ? input.comment?.trim() ?? null : null,
      ...(input.actor === "CLIENT"
        ? { clientChangeRequestsCount: { increment: 1 } }
        : { masterChangeRequestsCount: { increment: 1 } }),
      ...(typeof input.silentMode === "boolean" ? { silentMode: input.silentMode } : {}),
    },
    select: {
      id: true,
      status: true,
      slotLabel: true,
      providerId: true,
      masterProviderId: true,
      clientName: true,
      clientPhone: true,
      comment: true,
      silentMode: true,
      startAtUtc: true,
      endAtUtc: true,
      actionRequiredBy: true,
      requestedBy: true,
      changeComment: true,
      proposedStartAt: true,
      proposedEndAt: true,
      clientChangeRequestsCount: true,
      masterChangeRequestsCount: true,
      service: { select: { id: true, name: true } },
    },
  });

  await invalidateSlotsForBookingMove({
    previous: {
      providerId: booking.providerId,
      masterProviderId: booking.masterProviderId ?? null,
      startAtUtc: booking.startAtUtc,
      endAtUtc: booking.endAtUtc,
    },
    next: {
      providerId: booking.providerId,
      masterProviderId: booking.masterProviderId ?? null,
      startAtUtc: input.startAtUtc,
      endAtUtc: input.endAtUtc,
    },
  });

  return { ok: true, data: toBookingDto(updated) };
}


