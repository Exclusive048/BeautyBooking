import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { isSubscriptionActive } from "@/lib/billing/subscription-active";

const NOW = new Date("2026-07-07T12:00:00.000Z");
const PAST = new Date("2026-07-01T00:00:00.000Z");
const FUTURE = new Date("2026-07-31T00:00:00.000Z");

describe("isSubscriptionActive — HARDENING-03 FIX-5", () => {
  it("null / undefined subscription → inactive", () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false);
    expect(isSubscriptionActive(undefined, NOW)).toBe(false);
  });

  it("ACTIVE within period (currentPeriodEnd > now) → active", () => {
    expect(
      isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: FUTURE, graceUntil: null }, NOW)
    ).toBe(true);
  });

  it("ACTIVE with null currentPeriodEnd → active (unchanged)", () => {
    expect(
      isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: null, graceUntil: null }, NOW)
    ).toBe(true);
  });

  it("ACTIVE with lapsed period (currentPeriodEnd <= now) → inactive", () => {
    expect(
      isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: PAST, graceUntil: null }, NOW)
    ).toBe(false);
  });

  it("PAST_DUE within grace (period ended, graceUntil > now) → active — the fix", () => {
    expect(
      isSubscriptionActive({ status: "PAST_DUE", currentPeriodEnd: PAST, graceUntil: FUTURE }, NOW)
    ).toBe(true);
  });

  it("PAST_DUE past grace (graceUntil <= now) → inactive", () => {
    expect(
      isSubscriptionActive(
        { status: "PAST_DUE", currentPeriodEnd: PAST, graceUntil: PAST },
        NOW
      )
    ).toBe(false);
  });

  it("PAST_DUE with null graceUntil → inactive", () => {
    expect(
      isSubscriptionActive({ status: "PAST_DUE", currentPeriodEnd: PAST, graceUntil: null }, NOW)
    ).toBe(false);
  });

  it("EXPIRED → inactive (even with a future graceUntil, status is not PAST_DUE)", () => {
    expect(
      isSubscriptionActive({ status: "EXPIRED", currentPeriodEnd: PAST, graceUntil: FUTURE }, NOW)
    ).toBe(false);
  });

  it("CANCELLED → inactive", () => {
    expect(
      isSubscriptionActive({ status: "CANCELLED", currentPeriodEnd: FUTURE, graceUntil: null }, NOW)
    ).toBe(false);
  });

  it("PENDING (never activated) → inactive", () => {
    expect(
      isSubscriptionActive({ status: "PENDING", currentPeriodEnd: null, graceUntil: null }, NOW)
    ).toBe(false);
  });

  it("re-anchored ACTIVE (graceUntil null, future period) → active (HARDENING-01 FIX-3 unaffected)", () => {
    expect(
      isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: FUTURE, graceUntil: null }, NOW)
    ).toBe(true);
  });

  describe("boundary — strict > now", () => {
    it("graceUntil exactly === now → inactive", () => {
      expect(
        isSubscriptionActive({ status: "PAST_DUE", currentPeriodEnd: PAST, graceUntil: NOW }, NOW)
      ).toBe(false);
    });

    it("currentPeriodEnd exactly === now → inactive (unless in grace)", () => {
      expect(
        isSubscriptionActive({ status: "ACTIVE", currentPeriodEnd: NOW, graceUntil: null }, NOW)
      ).toBe(false);
    });
  });
});

// Guardrail: both plan-gating call sites must delegate to the shared predicate
// so the two "active" definitions can never silently diverge (the exact drift
// FIX-5 collapsed). Byte-level check catches an inlined re-definition.
describe("FIX-5 — plan-gating call sites use the shared predicate", () => {
  const read = (rel: string) =>
    readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

  it("get-current-plan.ts imports + calls isSubscriptionActive", () => {
    const src = read("./get-current-plan.ts");
    expect(src).toContain("isSubscriptionActive");
    // no inline re-derivation of the old dead pattern
    expect(src).not.toMatch(/status === "PAST_DUE"\)\s*&&/);
  });

  it("analytics/domain/guards.ts imports + calls isSubscriptionActive", () => {
    const src = read("../../features/analytics/domain/guards.ts");
    expect(src).toContain("isSubscriptionActive");
    expect(src).not.toMatch(/status === "PAST_DUE"\)\s*&&/);
  });
});
