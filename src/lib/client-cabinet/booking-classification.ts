import type { BookingStatus } from "@prisma/client";
import { resolveBookingRuntimeStatus } from "@/lib/bookings/flow";

export type ClientBookingGroup = "upcoming" | "finished" | "cancelled";

/**
 * FIX-EXP-A11Y-PWA (EXP-013): classify a client booking into upcoming /
 * finished / cancelled using the CANONICAL runtime-finished cutoff
 * (`resolveBookingRuntimeStatus` — the very same predicate `can-leave` /
 * `canReview` use), NOT the persisted status alone.
 *
 * The old split was status-based, so a CONFIRMED/PENDING booking whose time has
 * already elapsed (but was never marked FINISHED) stayed under "Предстоящие"
 * and still offered Перенести/Отменить on an already-past slot.
 *
 * - "cancelled": CANCELLED / REJECTED / NO_SHOW (terminal — normalized → REJECTED).
 * - "finished": persisted-FINISHED OR elapsed (`startAtUtc + duration + grace ≤ now`).
 * - "upcoming": genuinely upcoming/active (PENDING / CONFIRMED / IN_PROGRESS /
 *   CHANGE_REQUESTED that has NOT elapsed). Only these legitimately offer
 *   reschedule/cancel.
 *
 * The comparison is instant-based (UTC) — `resolveBookingRuntimeStatus` compares
 * UTC instants, which is timezone-agnostic. The entity-tz "day" is a separate
 * display concern (the `isToday` highlight), not part of the elapsed check.
 * No third definition of "past" — reuses `flow.ts` (rule 8 / the `/slots`-vs-
 * `/availability` divergence lesson).
 */
export function classifyClientBookingGroup(input: {
  status: BookingStatus;
  startAtUtc: Date | null;
  endAtUtc: Date | null;
  now: Date;
}): ClientBookingGroup {
  const runtime = resolveBookingRuntimeStatus(input);
  if (runtime === "REJECTED") return "cancelled";
  if (runtime === "FINISHED") return "finished";
  return "upcoming";
}
