import type { BookingStatus } from "@prisma/client";
import { AppError } from "@/lib/api/errors";

export const BOOKING_ACTION_WINDOW_MINUTES = 60;
export const BOOKING_FINISH_GRACE_MINUTES = 60;
export const BOOKING_CHANGE_REQUEST_LIMIT = 3;

// AUDIT (booking flow):
// - auto IN_PROGRESS/FINISHED: реализовано через resolveBookingRuntimeStatus (runtime-вычисление).
// - правило 60 минут для отмены/переноса: реализовано через ensureBookingActionWindow в src/lib.
// - замечание: статус в БД не персистится автоматически в IN_PROGRESS/FINISHED (частично относительно "авто-смена статуса").

export type BookingActor = "CLIENT" | "MASTER";

export type BookingRuntimeStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHANGE_REQUESTED"
  | "REJECTED"
  | "IN_PROGRESS"
  | "FINISHED";

function durationMinutesFromRange(startAtUtc: Date | null, endAtUtc: Date | null): number {
  if (!startAtUtc || !endAtUtc) return 0;
  const diffMs = endAtUtc.getTime() - startAtUtc.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.max(0, Math.round(diffMs / 60000));
}

export function normalizeBookingStatus(status: BookingStatus): BookingRuntimeStatus {
  if (status === "NEW") return "PENDING";
  if (status === "PREPAID") return "CONFIRMED";
  if (status === "STARTED") return "IN_PROGRESS";
  if (status === "CANCELLED" || status === "NO_SHOW") return "REJECTED";
  return status as BookingRuntimeStatus;
}

export function resolveBookingRuntimeStatus(input: {
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  now?: Date;
}): BookingRuntimeStatus {
  const normalized = normalizeBookingStatus(input.status);
  if (normalized === "REJECTED" || normalized === "FINISHED") return normalized;
  if (!input.startAtUtc) return normalized;

  const nowMs = (input.now ?? new Date()).getTime();
  const startMs = input.startAtUtc.getTime();
  if (!Number.isFinite(startMs)) return normalized;

  const durationMinutes = durationMinutesFromRange(input.startAtUtc, input.endAtUtc);
  const finishedAtMs =
    startMs + (durationMinutes + BOOKING_FINISH_GRACE_MINUTES) * 60 * 1000;

  if (nowMs >= finishedAtMs) return "FINISHED";
  if (nowMs >= startMs) return "IN_PROGRESS";
  return normalized;
}

export function minutesUntilStart(startAtUtc: Date | null, now: Date = new Date()): number | null {
  if (!startAtUtc) return null;
  const diffMs = startAtUtc.getTime() - now.getTime();
  if (!Number.isFinite(diffMs)) return null;
  return Math.floor(diffMs / 60000);
}

export function ensureBookingActionWindow(startAtUtc: Date | null, now: Date = new Date()): void {
  if (!startAtUtc) {
    throw new AppError("Booking time is missing", 409, "BOOKING_TIME_REQUIRED");
  }
  const minutesLeft = minutesUntilStart(startAtUtc, now);
  if (minutesLeft === null) {
    throw new AppError("Booking time is invalid", 409, "BOOKING_TIME_REQUIRED");
  }
  if (minutesLeft < BOOKING_ACTION_WINDOW_MINUTES) {
    throw new AppError(
      "Cancellation and reschedule are unavailable less than 60 minutes before start",
      409,
      "CONFLICT"
    );
  }
}

export function ensureCancellationDeadline(
  startAtUtc: Date | null,
  deadlineHours: number | null | undefined,
  now: Date = new Date()
): void {
  if (deadlineHours === null || deadlineHours === undefined) return;
  if (!startAtUtc) {
    throw new AppError("Booking time is missing", 409, "BOOKING_TIME_REQUIRED");
  }
  const startMs = startAtUtc.getTime();
  if (!Number.isFinite(startMs)) {
    throw new AppError("Booking time is invalid", 409, "BOOKING_TIME_REQUIRED");
  }

  if (deadlineHours <= 0) {
    throw new AppError("Отмена записи запрещена", 423, "CANCELLATION_DEADLINE_PASSED");
  }

  const deadlineMs = startMs - deadlineHours * 60 * 60 * 1000;
  if (now.getTime() > deadlineMs) {
    throw new AppError("Срок отмены записи истёк", 423, "CANCELLATION_DEADLINE_PASSED");
  }
}

export function canCancelOrReschedule(status: BookingStatus): boolean {
  const normalized = normalizeBookingStatus(status);
  return normalized === "PENDING" || normalized === "CONFIRMED";
}
