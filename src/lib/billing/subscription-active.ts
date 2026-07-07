import type { SubscriptionStatus } from "@prisma/client";

/** Minimal subscription shape needed to decide whether paid features apply. */
export type ActiveSubscriptionInput = {
  status: SubscriptionStatus;
  currentPeriodEnd: Date | null;
  graceUntil: Date | null;
};

/**
 * Whether a subscription currently grants its paid plan's features.
 *
 * Two ways to be active:
 *  1. Within the paid period — ACTIVE (or a still-valid PAST_DUE) whose
 *     `currentPeriodEnd` is in the future (or unset).
 *  2. Within the 7-day grace window — PAST_DUE whose `graceUntil` is still in
 *     the future. This is the grace the billing UI promises («оплатите до
 *     {дата}»); the grace cron flips PAST_DUE → EXPIRED only once
 *     `graceUntil < now`.
 *
 * HARDENING-03 FIX-5: PAST_DUE is only ever set AFTER `currentPeriodEnd` has
 * passed (renewals charge at/after the period end), so branch 1 alone leaves
 * PAST_DUE permanently dead and grace grants zero access. Branch 2 restores it.
 *
 * PENDING / CANCELLED / EXPIRED / null grant nothing. A re-anchored ACTIVE sub
 * (HARDENING-01 FIX-3) has `graceUntil: null` + a future `currentPeriodEnd` →
 * branch 1, so this predicate leaves it untouched.
 */
export function isSubscriptionActive(
  subscription: ActiveSubscriptionInput | null | undefined,
  now: Date
): boolean {
  if (!subscription) return false;

  const withinPaidPeriod =
    (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") &&
    (subscription.currentPeriodEnd === null || subscription.currentPeriodEnd > now);

  const withinGrace =
    subscription.status === "PAST_DUE" &&
    subscription.graceUntil !== null &&
    subscription.graceUntil > now;

  return withinPaidPeriod || withinGrace;
}
