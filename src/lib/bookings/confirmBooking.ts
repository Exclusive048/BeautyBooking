import { Prisma, type BookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { AppError } from "@/lib/api/errors";
import type { BookingStatusUpdateDto } from "@/lib/bookings/dto";
import { resolveBookingRuntimeStatus, type BookingActor } from "@/lib/bookings/flow";
import { invalidateSlotsForBookingMove } from "@/lib/bookings/slot-invalidation";
import { assertNoTimeBlockConflict } from "@/lib/schedule/time-blocks";
import { scheduleBookingReminders } from "@/lib/bookings/reminders";
import {
  emitBookingConfirmedSystemMessage,
  emitBookingRescheduledSystemMessage,
} from "@/lib/chat/system-messages";
import { logError } from "@/lib/logging/logger";

function shiftMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && aEnd > bStart;
}

function isValidDate(value: Date | null | undefined): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function normalizeBufferMinutes(value: number | null | undefined): number {
  if (!Number.isFinite(value)) return 0;
  const safe = Math.floor(value as number);
  if (safe <= 0) return 0;
  return Math.min(30, safe);
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

export async function confirmBooking(
  bookingId: string,
  actor: BookingActor
): Promise<BookingStatusUpdateDto> {
  // AUDIT (подтверждение):
  // - реализовано: MASTER подтверждает PENDING -> CONFIRMED.
  // - реализовано: подтверждение CHANGE_REQUESTED только стороной из actionRequiredBy.
  // - реализовано: при подтверждении переноса proposed* применяются в start/end и очищаются.
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      id: true,
      status: true,
      providerId: true,
      masterProviderId: true,
      startAtUtc: true,
      endAtUtc: true,
      startAt: true,
      endAt: true,
      proposedStartAt: true,
      proposedEndAt: true,
      actionRequiredBy: true,
      requestedBy: true,
    },
  });
  if (!booking) throw new AppError("Booking not found", 404, "BOOKING_NOT_FOUND");

  const runtimeStatus = resolveBookingRuntimeStatus({
    status: booking.status,
    startAtUtc: booking.startAtUtc,
    endAtUtc: booking.endAtUtc,
  });

  if (runtimeStatus === "REJECTED") {
    throw new AppError("Booking rejected", 409, "BOOKING_CANCELLED");
  }

  if (runtimeStatus === "IN_PROGRESS" || runtimeStatus === "FINISHED") {
    throw new AppError("Booking already started", 409, "CONFLICT");
  }

  if (runtimeStatus === "CONFIRMED") {
    return { id: booking.id, status: "CONFIRMED" };
  }

  const previousStartAtUtc = booking.startAtUtc;
  const previousEndAtUtc = booking.endAtUtc;

  let startAtUtc = booking.startAtUtc;
  let endAtUtc = booking.endAtUtc;
  let appliesRequestedChange = false;

  if (runtimeStatus === "PENDING") {
    if (actor !== "MASTER") {
      throw new AppError("Forbidden", 403, "FORBIDDEN");
    }
  } else if (runtimeStatus === "CHANGE_REQUESTED") {
    if (!booking.actionRequiredBy || booking.actionRequiredBy !== actor) {
      throw new AppError("Action is required from another side", 409, "CONFLICT");
    }
    startAtUtc = booking.proposedStartAt;
    endAtUtc = booking.proposedEndAt;
    appliesRequestedChange = true;
  } else {
    throw new AppError("Booking cannot be confirmed in current state", 409, "CONFLICT");
  }

  if (!isValidDate(startAtUtc) || !isValidDate(endAtUtc)) {
    throw new AppError("Booking time is missing", 409, "BOOKING_TIME_REQUIRED");
  }

  const bufferMin = await resolveBufferMinutes(booking.providerId, booking.masterProviderId);
  const conflictWhere = booking.masterProviderId
    ? { providerId: booking.providerId, masterProviderId: booking.masterProviderId }
    : { providerId: booking.providerId };

  const bufferedStart = bufferMin ? shiftMinutes(startAtUtc, -bufferMin) : startAtUtc;
  const bufferedEnd = bufferMin ? shiftMinutes(endAtUtc, bufferMin) : endAtUtc;

  // FIX-R2-01-B: the conflict re-check now runs INSIDE the move transaction
  // under Serializable isolation, mirroring `createBooking` /
  // `createSoloMasterBooking`. Previously it ran outside the tx (and the tx
  // used default isolation), leaving a TOCTOU window: two concurrent
  // approvals onto overlapping slots could both pass the pre-check and both
  // commit → double-book. Buffer resolution + the buffered window are pure
  // config reads + arithmetic, so they stay outside; only the
  // conflict-detection READ and the WRITE must share one Serializable
  // snapshot. The exclude-self filter (`id: { not: booking.id }`) is
  // preserved — a reschedule still holds its OLD slot at approval time, so
  // the moved booking must not conflict with its own row. `ensureNoConflicts`
  // is intentionally NOT adopted here: it has no exclude-self, so a shift
  // overlapping the booking's own current slot would falsely conflict.
  let updated: { id: string; status: BookingStatus };
  try {
    updated = await prisma.$transaction(
      async (tx) => {
        const conflicts = await tx.booking.findMany({
          where: {
            ...conflictWhere,
            id: { not: booking.id },
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
          throw new AppError("Time slot is not available", 409, "SLOT_CONFLICT");
        }

        // FIX-TIMEBLOCK-ENFORCEMENT-01: confirming a reschedule applies the
        // proposed time — it must not land the booking inside a TimeBlock. Owner
        // is the performing master (`masterProviderId`, or `providerId` for solo).
        // Only the moving side pays this: for a plain PENDING→CONFIRMED the time
        // is unchanged, but re-checking is harmless (a block created under an
        // existing booking is surfaced here rather than silently confirmed).
        await assertNoTimeBlockConflict(tx, {
          masterProviderId: booking.masterProviderId ?? booking.providerId,
          startAtUtc,
          endAtUtc,
        });

        return tx.booking.update({
          where: { id: bookingId },
          data: {
            status: "CONFIRMED",
            actionRequiredBy: null,
            requestedBy: null,
            changeComment: null,
            proposedStartAt: null,
            proposedEndAt: null,
            ...(appliesRequestedChange
              ? {
                  startAtUtc,
                  endAtUtc,
                  startAt: startAtUtc,
                  endAt: endAtUtc,
                  slotLabel: startAtUtc.toISOString(),
                  reminder24hSentAt: null,
                  reminder2hSentAt: null,
                }
              : {}),
          },
          select: { id: true, status: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (error) {
    // A true-concurrent approval race surfaces under Serializable as a
    // write-conflict / serialization failure (P2034) or a unique race
    // (P2002) at COMMIT time. Map it to the same clean, retryable 409 the
    // in-tx predicate check throws — never a 500. Mirrors
    // `mapPrismaBookingConflict` in `createBooking`.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2034" || error.code === "P2002")
    ) {
      throw new AppError("Time slot is not available", 409, "SLOT_CONFLICT");
    }
    throw error;
  }

  try {
    await scheduleBookingReminders(updated.id);
  } catch (error) {
    logError("Failed to schedule booking reminders", {
      bookingId: updated.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (appliesRequestedChange) {
    await invalidateSlotsForBookingMove({
      previous: {
        providerId: booking.providerId,
        masterProviderId: booking.masterProviderId ?? null,
        startAtUtc: previousStartAtUtc,
        endAtUtc: previousEndAtUtc,
      },
      next: {
        providerId: booking.providerId,
        masterProviderId: booking.masterProviderId ?? null,
        startAtUtc,
        endAtUtc,
      },
    });
  }

  // System messages in chat. Idempotent at DB level via unique constraint —
  // safe across webhook retries. Failures are logged but don't break the
  // confirm — chat decoration is a nice-to-have, not a transactional
  // requirement.
  try {
    if (appliesRequestedChange) {
      const provider = await prisma.provider.findUnique({
        where: { id: booking.providerId },
        select: { timezone: true },
      });
      await emitBookingRescheduledSystemMessage({
        bookingId: booking.id,
        oldStart: previousStartAtUtc,
        newStart: startAtUtc,
        timezone: provider?.timezone ?? "Europe/Moscow",
      });
    } else {
      await emitBookingConfirmedSystemMessage(booking.id);
    }
  } catch (error) {
    logError("Failed to emit booking system message (confirm)", {
      bookingId: booking.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return { id: updated.id, status: updated.status };
}
