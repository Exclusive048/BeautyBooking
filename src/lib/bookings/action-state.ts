import { BOOKING_ACTION_WINDOW_MINUTES, minutesUntilStart } from "@/lib/bookings/flow";

/**
 * MASTER-DASHBOARD-FIX-A — shared "is the booking still actionable?"
 * predicates for the master UI. Reuses the canonical semantics already
 * encoded in `flow.ts`:
 *
 *   - `BOOKING_ACTION_WINDOW_MINUTES` (60) — the cancel/reschedule
 *     window. Mirrors `ensureBookingActionWindow` on the backend, so
 *     UI disables in lock-step with what the server would reject.
 *   - `minutesUntilStart` — pure helper, timezone-safe (uses
 *     `getTime()` deltas).
 *
 * Two distinct deadlines surface here:
 *
 *   • **confirm window** — master can still confirm a PENDING booking
 *     up to its start time. Past that, the booking either happened
 *     (CONFIRMED was assumed) or didn't (NO_SHOW). The "Требуют
 *     внимания" panel filters by this — a pending row whose start has
 *     already passed isn't actionable any more.
 *
 *   • **modify window** — master can cancel or reschedule up to
 *     `start - 60min`. Inside that window the backend returns 409 and
 *     the UI must hide / disable the actions so the master doesn't
 *     hit it.
 *
 * Both helpers accept `null` start (legacy slot-label-only bookings)
 * and return `false` — treating them as still-actionable. The
 * Prisma-level dashboard filter uses `startAtUtc: { gt: now }` which
 * implicitly excludes null too, so the predicate's null-handling here
 * is for client-side action button gating only.
 */

export function isBookingPastConfirmWindow(
  startAtUtc: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!startAtUtc) return false;
  return startAtUtc.getTime() <= now.getTime();
}

export function isBookingPastModifyWindow(
  startAtUtc: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!startAtUtc) return false;
  const minutesLeft = minutesUntilStart(startAtUtc, now);
  if (minutesLeft === null) return false;
  return minutesLeft < BOOKING_ACTION_WINDOW_MINUTES;
}
