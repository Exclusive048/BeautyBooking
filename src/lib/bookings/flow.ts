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
    throw new AppError("Укажите время записи.", 409, "BOOKING_TIME_REQUIRED");
  }
  const minutesLeft = minutesUntilStart(startAtUtc, now);
  if (minutesLeft === null) {
    throw new AppError("Проверьте время записи.", 409, "BOOKING_TIME_REQUIRED");
  }
  if (minutesLeft < BOOKING_ACTION_WINDOW_MINUTES) {
    throw new AppError(
      "Отменить или перенести запись можно не позднее чем за 60 минут до начала.",
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
    throw new AppError("Укажите время записи.", 409, "BOOKING_TIME_REQUIRED");
  }
  const startMs = startAtUtc.getTime();
  if (!Number.isFinite(startMs)) {
    throw new AppError("Проверьте время записи.", 409, "BOOKING_TIME_REQUIRED");
  }

  // CANCEL-DEADLINE-ZERO-01: «0 часов» — это «поздней отмены нет», а не «отменять
  // нельзя никогда». Прежний отказ на `<= 0` запирал клиентскую отмену у любого
  // провайдера, который вписал 0 в поле «Бесплатная отмена» (кабинет студии
  // принимает 0…168 и подписывает поле «позже этого срока отмена считается
  // поздней»), — клиент не мог отменить ни одной записи. Отмена после начала
  // визита по-прежнему запрещена — отдельным правилом (`canCancelBookingStatus`
  // + окно действия), не этим.
  if (deadlineHours <= 0) return;

  const deadlineMs = startMs - deadlineHours * 60 * 60 * 1000;
  if (now.getTime() > deadlineMs) {
    throw new AppError("Отменить запись уже нельзя — срок прошёл.", 423, "CANCELLATION_DEADLINE_PASSED");
  }
}

/**
 * Статусы, из которых бронь можно отменить. Единственный источник для отмены
 * одиночной брони, пакета и поверхностей, показывающих отменяемое.
 *
 * `CHANGE_REQUESTED` сюда входит: пока перенос согласуется, запись остаётся
 * живой, и отказ от неё не должен ждать ответа второй стороны. Раньше отмена
 * судила по отдельному предикату без этого статуса — клиент, попросивший
 * перенос, не мог отменить запись, пока мастер молчал, а сторона, которой
 * перенос предложили, «отменой» его только отклоняла.
 */
function isCancellableStatus(status: BookingRuntimeStatus): boolean {
  return status === "PENDING" || status === "CONFIRMED" || status === "CHANGE_REQUESTED";
}

export function canCancelBookingStatus(status: BookingStatus): boolean {
  return isCancellableStatus(normalizeBookingStatus(status));
}

/**
 * LOGIC-13: может ли бронь быть отменена ОДИНОЧНОЙ отменой (`cancelBooking`).
 *
 * Существует, чтобы поверхности, которые ПОКАЗЫВАЮТ список отменяемых броней,
 * отвечали ровно то же, что ответит сама отмена. Компонент пакета отменяется
 * только целиком (инв. #34), и `cancelBooking` бросает на нём 409
 * `PACKAGE_CANCEL_WHOLE`; поверхность, судящая только по статусу, обещает
 * отмену, которой не будет, — и вызывающий узнаёт об этом уже посреди цикла
 * отмен.
 */
export function canCancelIndividually(input: {
  status: BookingRuntimeStatus;
  bookingPackageId: string | null;
}): boolean {
  if (input.bookingPackageId !== null) return false;
  return isCancellableStatus(input.status);
}
