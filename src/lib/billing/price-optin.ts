import { PRICE_OPTIN_GRACE_DAYS } from "@/lib/billing/constants";

/**
 * BILLING-RENEWAL-OPTIN-02 (R2-05-C-v2) — pure helpers for opt-in renewal on a
 * PRICE INCREASE. Kept side-effect-free so the trigger + timing rules are unit-
 * testable independently of Prisma/YooKassa.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** Reminder is due when the deadline is within this window of `now`. */
export const PRICE_OPTIN_REMINDER_24H_MS = 24 * HOUR_MS;
export const PRICE_OPTIN_REMINDER_2H_MS = 2 * HOUR_MS;

/**
 * The opt-in branch triggers ONLY on a genuine increase versus what the
 * subscriber last actually paid (most-recent SUCCEEDED payment amount).
 *
 *  - `lastSucceededAmountKopeks === null` (no prior successful payment) → NEVER
 *    opt-in → normal renewal. This keeps first-ever renewals and edge rows on
 *    the byte-identical auto-renew path.
 *  - equal or lower price → normal renewal.
 *  - strictly higher price → opt-in.
 */
export function shouldEnterPriceOptIn(
  newPriceKopeks: number,
  lastSucceededAmountKopeks: number | null,
): boolean {
  if (lastSucceededAmountKopeks === null) return false;
  return newPriceKopeks > lastSucceededAmountKopeks;
}

/** The 2-day opt-in deadline (also stored in `graceUntil`). */
export function priceOptInDeadline(now: Date): Date {
  return new Date(now.getTime() + PRICE_OPTIN_GRACE_DAYS * DAY_MS);
}
