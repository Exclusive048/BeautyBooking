import { AppError } from "@/lib/api/errors";
import { getDayOfWeek, getLocalTimeParts, toLocalDateKey } from "@/lib/schedule/timezone";

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
 * Clamps a window to `visibleSlotDays` from `now`. Returns the inclusive
 * `toDateKey` (YYYY-MM-DD) the slot endpoint should not exceed. Used by the
 * public slots route to respect the provider's catalog visibility horizon.
 *
 * HARDENING-10 #16 — the horizon date-key is derived in the **provider's**
 * timezone (`toLocalDateKey(horizon, timeZone)`), consistent with the rest of
 * the booking date logic. Deriving it in UTC dropped the last visible local day
 * for east-of-UTC providers during early-morning local hours (the horizon
 * instant's UTC date-key lagged its local date-key by one). The horizon options
 * and the clamp are unchanged — only the date-key derivation is provider-local.
 */
export function clampVisibleSlotsHorizon(
  requestedToKey: string | null | undefined,
  policy: Pick<ProviderPolicy, "visibleSlotDays">,
  now: Date,
  timeZone: string,
): string {
  const days = Math.max(1, policy.visibleSlotDays);
  const horizon = new Date(now.getTime() + (days - 1) * MS_PER_DAY);
  const horizonKey = toLocalDateKey(horizon, timeZone);
  if (!requestedToKey) return horizonKey;
  return requestedToKey < horizonKey ? requestedToKey : horizonKey;
}

/**
 * STUDIO-RESCHEDULE-VALIDATION-A — reschedule-specific pure helpers
 * extending the same policy file as the booking-window guards above.
 * Both helpers are side-effect-free (no Prisma) so unit tests can
 * exhaustively cover the rule semantics without database setup. The
 * DB-aware caller in `studio/bookings.service.ts:moveStudioBooking`
 * fetches the rows once and feeds them in.
 *
 * Why these live here:
 *   - `assertMasterPerformsService` rule says "the target master must
 *     have an enabled MasterService for the booking's serviceId". The
 *     check itself is one boolean — keeping it here aligns the studio
 *     reschedule enforcement style with the rest of policy-enforcement.
 *   - `assertWithinMasterWorkHours` rule says "the new local time must
 *     fall inside the target master's working window for that
 *     weekday". The pure helper takes a normalised window shape
 *     (`startMinutes`/`endMinutes`/`isActive`) plus the booking's
 *     local minutes, returning explicit error codes.
 *
 * Both throw `AppError(422, ...)` mirroring STUDIO-APPROVE-400-FIX-A's
 * "data understood but unprocessable" pattern — clearer than a bare 400
 * for the studio admin trying to move a booking onto an incompatible
 * master or outside hours.
 */

export type MasterWorkWindow = {
  /** True when the master works that weekday at all. */
  isActive: boolean;
  /** Minutes-from-midnight, inclusive. Null when the day is off. */
  startMinutes: number | null;
  endMinutes: number | null;
};

export function assertMasterPerformsService(input: {
  hasEnabledMasterService: boolean;
}): void {
  if (!input.hasEnabledMasterService) {
    throw new AppError(
      "Этот мастер не выполняет выбранную услугу.",
      422,
      "MASTER_SERVICE_MISMATCH",
    );
  }
}

export function assertWithinMasterWorkHours(input: {
  bookingStartMinutes: number;
  bookingEndMinutes: number;
  window: MasterWorkWindow;
}): void {
  if (!input.window.isActive) {
    throw new AppError(
      "Мастер не работает в выбранный день.",
      422,
      "OUTSIDE_WORK_HOURS",
    );
  }
  if (input.window.startMinutes === null || input.window.endMinutes === null) {
    throw new AppError(
      "Мастер не работает в выбранный день.",
      422,
      "OUTSIDE_WORK_HOURS",
    );
  }
  // Booking must start at or after the window opens, AND end at or
  // before the window closes. Equality is allowed at both edges —
  // matches how the schedule engine treats inclusive boundaries.
  if (
    input.bookingStartMinutes < input.window.startMinutes ||
    input.bookingEndMinutes > input.window.endMinutes
  ) {
    throw new AppError(
      "Выбранное время вне рабочих часов мастера.",
      422,
      "OUTSIDE_WORK_HOURS",
    );
  }
}

/**
 * FIX-R2-04-B — derive the salon-local "parts" of a real-UTC booking
 * instant for the studio work-hours guard.
 *
 * The defect this closes: `moveStudioBooking` / `createStudioBooking`
 * read `getUTCHours()` / `getUTCDay()` / a UTC-derived dateKey on a
 * **real-UTC** instant (the move dialog + storage both send/keep
 * real-UTC — DB-verified: a Vision booking `15:00 UTC` = `10:00
 * Asia/Almaty`). But the master work-hours window (`startLocal` /
 * `endLocal` strings like "10:00") is **salon-local**, so the hour,
 * weekday, AND override-date must all be read in the salon timezone,
 * NOT in UTC. Reading them in UTC offsets the whole comparison by the
 * salon's UTC offset → wrong window for every non-UTC (RU) studio.
 *
 * This mirrors how the slot engine (`schedule/slots.ts`,
 * `schedule/engine-context.ts`) and the booking-label formatters
 * (FIX-04/11/20/22) read local parts: via the same `getLocalTimeParts`
 * / `getDayOfWeek` / `toLocalDateKey` helpers, against the master
 * provider's own `timezone`. Using the SAME helpers + SAME tz as the
 * engine keeps the guard and slot-gen in agreement — a slot the engine
 * offered passes the guard; a time the engine would not offer fails it.
 *
 * - `weekday` (0=Sun..6=Sat) is the engine's local-weekday resolution.
 *   ⚠️ `WeeklyScheduleDay.weekday` is stored 1=Mon..7=Sun — lookups must
 *   convert via `toScheduleWeekday` (`schedule/master-work-window.ts`,
 *   SCHEDULE-SUNDAY-01); a raw 0 never matches Sunday.
 * - `dateKey` matches the engine's `toLocalDateKey(override.date, tz)`
 *   bucketing for the `ScheduleOverride` lookup (overrides are stored at
 *   UTC-midnight of the local date key, so the local dateKey resolves
 *   the right override row).
 *
 * Pure (Intl only, no Prisma) so the rule is unit-tested exhaustively.
 */
export type SalonLocalParts = {
  /** Minutes-from-midnight in salon-local time (hour*60 + minute). */
  minutesFromMidnight: number;
  /** Weekday in salon-local time, 0 = Sun .. 6 = Sat. */
  weekday: number;
  /** YYYY-MM-DD salon-local date key for the ScheduleOverride lookup. */
  dateKey: string;
};

export function resolveSalonLocalParts(
  instantUtc: Date,
  timeZone: string,
): SalonLocalParts {
  const { hour, minute } = getLocalTimeParts(instantUtc, timeZone);
  return {
    minutesFromMidnight: hour * 60 + minute,
    weekday: getDayOfWeek(instantUtc, timeZone),
    dateKey: toLocalDateKey(instantUtc, timeZone),
  };
}
