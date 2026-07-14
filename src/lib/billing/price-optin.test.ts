import { describe, expect, it } from "vitest";
import { PRICE_OPTIN_GRACE_DAYS } from "@/lib/billing/constants";
import {
  PRICE_OPTIN_REMINDER_24H_MS,
  PRICE_OPTIN_REMINDER_2H_MS,
  priceOptInDeadline,
  shouldEnterPriceOptIn,
} from "@/lib/billing/price-optin";

/**
 * BILLING-RENEWAL-OPTIN-02 (R2-05-C-v2) — pins the opt-in trigger (the
 * correctness pivot) + timing. The DB-aware pieces (reminder scan, accept
 * re-anchor, lapse EXPIRED, MRR exclusion) are enforced by the query/flag
 * structure in renew/run + webhook-processor + price-optin-cron and exercised
 * end-to-end when the integration-test infra lands (same policy as the existing
 * createBooking/renewal integration gaps).
 */

describe("BILLING-RENEWAL-OPTIN — shouldEnterPriceOptIn (trigger basis)", () => {
  it("triggers opt-in only on a STRICT increase vs the last paid amount", () => {
    expect(shouldEnterPriceOptIn(150_000, 100_000)).toBe(true);
  });

  it("does NOT trigger when the price is unchanged (byte-identical auto-renew)", () => {
    expect(shouldEnterPriceOptIn(100_000, 100_000)).toBe(false);
  });

  it("does NOT trigger when the price decreased", () => {
    expect(shouldEnterPriceOptIn(80_000, 100_000)).toBe(false);
  });

  it("does NOT trigger when there is no prior SUCCEEDED payment (null) — normal renewal", () => {
    expect(shouldEnterPriceOptIn(150_000, null)).toBe(false);
    expect(shouldEnterPriceOptIn(0, null)).toBe(false);
  });

  it("handles a 1-kopek increase (boundary)", () => {
    expect(shouldEnterPriceOptIn(100_001, 100_000)).toBe(true);
    expect(shouldEnterPriceOptIn(99_999, 100_000)).toBe(false);
  });
});

describe("BILLING-RENEWAL-OPTIN — priceOptInDeadline (2-day window)", () => {
  it("is now + PRICE_OPTIN_GRACE_DAYS days", () => {
    const now = new Date("2026-07-08T10:00:00.000Z");
    const deadline = priceOptInDeadline(now);
    const expected = now.getTime() + PRICE_OPTIN_GRACE_DAYS * 24 * 60 * 60 * 1000;
    expect(deadline.getTime()).toBe(expected);
  });

  it("uses the confirmed 2-day grace", () => {
    expect(PRICE_OPTIN_GRACE_DAYS).toBe(2);
  });

  it("does not mutate the input date", () => {
    const now = new Date("2026-07-08T10:00:00.000Z");
    const snapshot = now.getTime();
    priceOptInDeadline(now);
    expect(now.getTime()).toBe(snapshot);
  });
});

describe("BILLING-RENEWAL-OPTIN — reminder band constants", () => {
  it("24h band is wider than the 2h band (non-overlapping bands in the scan)", () => {
    expect(PRICE_OPTIN_REMINDER_24H_MS).toBe(24 * 60 * 60 * 1000);
    expect(PRICE_OPTIN_REMINDER_2H_MS).toBe(2 * 60 * 60 * 1000);
    expect(PRICE_OPTIN_REMINDER_24H_MS).toBeGreaterThan(PRICE_OPTIN_REMINDER_2H_MS);
  });
});
