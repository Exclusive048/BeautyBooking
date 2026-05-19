import { AppError } from "@/lib/api/errors";

/**
 * BOOKING-WIDGET-A — Provider policy enforcement.
 *
 * Pre-launch backlog gap closure: the 6 booking-rules fields on
 * `Provider` (minBookingHoursAhead / maxBookingDaysAhead /
 * acceptNewClients / cancellationDeadlineHours / lateCancelAction /
 * remindersEnabled / visibleSlotDays) were settable in cabinets but
 * **not validated** at booking time. Slot endpoints surfaced
 * impossible-to-book times, and `createBooking` accepted bookings
 * outside the configured windows.
 *
 * This helper centralises the validation rules so the same logic is
 * applied at three surfaces:
 *
 *   1. Slot generation (`/api/public/providers/[id]/slots`) — filters
 *      out slots before `now + minBookingHoursAhead` and clamps the
 *      visible window to `visibleSlotDays`.
 *   2. `resolveBookingCore` (called inside `createBooking`) — defends
 *      against direct API calls bypassing the slot UI.
 *   3. Future widget UIs (`/u/[username]/booking`) — can re-use the
 *      filter helpers for client-side display gating without forking
 *      the rules.
 *
 * Rules kept simple + side-effect-free so unit tests cover them
 * exhaustively.
 */

export type ProviderPolicy = {
  minBookingHoursAhead: number;
  maxBookingDaysAhead: number;
  acceptNewClients: boolean;
  visibleSlotDays: number;
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/** Earliest UTC moment a booking may start, given the policy + now. */
export function earliestBookableUtc(policy: Pick<ProviderPolicy, "minBookingHoursAhead">, now: Date): Date {
  const hours = Math.max(0, policy.minBookingHoursAhead);
  return new Date(now.getTime() + hours * MS_PER_HOUR);
}

/** Latest UTC moment a booking may start, given the policy + now. */
export function latestBookableUtc(policy: Pick<ProviderPolicy, "maxBookingDaysAhead">, now: Date): Date {
  const days = Math.max(1, policy.maxBookingDaysAhead);
  return new Date(now.getTime() + days * MS_PER_DAY);
}

/** True iff `startAtUtc` falls inside the bookable window. */
export function isWithinBookableWindow(
  startAtUtc: Date,
  policy: Pick<ProviderPolicy, "minBookingHoursAhead" | "maxBookingDaysAhead">,
  now: Date,
): boolean {
  return (
    startAtUtc.getTime() >= earliestBookableUtc(policy, now).getTime() &&
    startAtUtc.getTime() <= latestBookableUtc(policy, now).getTime()
  );
}

/**
 * Throws `AppError` (400) when `startAtUtc` lies outside the bookable
 * window. Error codes are distinct so the UI can render targeted copy.
 */
export function assertBookingWindow(
  startAtUtc: Date,
  policy: Pick<ProviderPolicy, "minBookingHoursAhead" | "maxBookingDaysAhead">,
  now: Date,
): void {
  if (startAtUtc.getTime() < earliestBookableUtc(policy, now).getTime()) {
    throw new AppError(
      `Запись возможна не раньше чем за ${policy.minBookingHoursAhead} ч.`,
      400,
      "BOOKING_TOO_SOON",
      { minBookingHoursAhead: policy.minBookingHoursAhead },
    );
  }
  if (startAtUtc.getTime() > latestBookableUtc(policy, now).getTime()) {
    throw new AppError(
      `Запись возможна не далее чем на ${policy.maxBookingDaysAhead} дней вперёд.`,
      400,
      "BOOKING_TOO_FAR",
      { maxBookingDaysAhead: policy.maxBookingDaysAhead },
    );
  }
}

/**
 * Throws `AppError` (403) when the provider doesn't accept new clients
 * AND the booking would be the first one for this client. `priorBookingsCount`
 * is the number of (non-cancelled) bookings the same `clientUserId`
 * already has with this provider (or studio).
 */
export function assertAcceptsNewClient(
  policy: Pick<ProviderPolicy, "acceptNewClients">,
  priorBookingsCount: number,
): void {
  if (!policy.acceptNewClients && priorBookingsCount === 0) {
    throw new AppError(
      "Мастер временно не принимает новых клиентов.",
      403,
      "NEW_CLIENTS_CLOSED",
    );
  }
}

/**
 * Clamps a UTC dateKey-derived window to `visibleSlotDays` from `now`.
 * Returns the inclusive `toDateKey` (YYYY-MM-DD) the slot endpoint
 * should not exceed. Used by the public slots route to respect the
 * provider's catalog visibility horizon.
 */
export function clampVisibleSlotsHorizon(
  requestedToKey: string | null | undefined,
  policy: Pick<ProviderPolicy, "visibleSlotDays">,
  now: Date,
): string {
  const days = Math.max(1, policy.visibleSlotDays);
  const horizon = new Date(now.getTime() + (days - 1) * MS_PER_DAY);
  const horizonKey = toDateKeyUtc(horizon);
  if (!requestedToKey) return horizonKey;
  return requestedToKey < horizonKey ? requestedToKey : horizonKey;
}

function toDateKeyUtc(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
