import { describe, expect, it } from "vitest";
import { resolvePlanPrice } from "@/lib/billing/pricing";

// monthly 1000.00 ₽ = 100000 kopecks
const MONTHLY = 100_000;

describe("resolvePlanPrice (FIX-BC-1 — single source of truth)", () => {
  it("returns the exact active period row when present (admin price wins)", () => {
    const prices = [
      { periodMonths: 1, priceKopeks: MONTHLY },
      { periodMonths: 3, priceKopeks: 270_000 },
      { periodMonths: 12, priceKopeks: 1_000_000 },
    ];
    expect(resolvePlanPrice(prices, 1)).toBe(MONTHLY);
    expect(resolvePlanPrice(prices, 3)).toBe(270_000);
    // explicit 12mo row honored — NOT recomputed as monthly*12*0.8 (960000).
    expect(resolvePlanPrice(prices, 12)).toBe(1_000_000);
  });

  it("falls back to monthly*N for 3/6 when the exact row is absent", () => {
    const prices = [{ periodMonths: 1, priceKopeks: MONTHLY }];
    expect(resolvePlanPrice(prices, 3)).toBe(MONTHLY * 3);
    expect(resolvePlanPrice(prices, 6)).toBe(MONTHLY * 6);
  });

  it("falls back to floor(monthly*12*0.8) for 12mo when the exact row is absent", () => {
    const prices = [{ periodMonths: 1, priceKopeks: MONTHLY }];
    expect(resolvePlanPrice(prices, 12)).toBe(Math.floor(MONTHLY * 12 * 0.8)); // 960000
  });

  it("rounds the 12mo discount down (matches cabinet billing page)", () => {
    const prices = [{ periodMonths: 1, priceKopeks: 99_999 }];
    // 99999*12*0.8 = 959990.4 → floor 959990
    expect(resolvePlanPrice(prices, 12)).toBe(959_990);
  });

  it("returns null when no exact row AND no monthly row (period not priceable)", () => {
    expect(resolvePlanPrice([], 3)).toBeNull();
    expect(resolvePlanPrice([{ periodMonths: 6, priceKopeks: 500_000 }], 3)).toBeNull();
  });

  it("is identical for checkout and renewal by construction (same fn, same args)", () => {
    const prices = [
      { periodMonths: 1, priceKopeks: MONTHLY },
      { periodMonths: 6, priceKopeks: 540_000 },
    ];
    for (const period of [1, 3, 6, 12]) {
      // The whole point: one function → signup amount === renewal amount.
      expect(resolvePlanPrice(prices, period)).toBe(resolvePlanPrice(prices, period));
    }
    // 6mo uses the explicit row on both paths; 3/12 use the monthly fallback.
    expect(resolvePlanPrice(prices, 6)).toBe(540_000);
    expect(resolvePlanPrice(prices, 3)).toBe(MONTHLY * 3);
    expect(resolvePlanPrice(prices, 12)).toBe(Math.floor(MONTHLY * 12 * 0.8));
  });

  it("FIX-R2-05-B: a stored 0/non-positive period row is 'no price' → falls back, never free", () => {
    // The footgun: editing only the monthly price persisted 0 rows for 3/6/12.
    const prices = [
      { periodMonths: 1, priceKopeks: MONTHLY },
      { periodMonths: 3, priceKopeks: 0 },
      { periodMonths: 6, priceKopeks: 0 },
      { periodMonths: 12, priceKopeks: 0 },
    ];
    // 0 rows must NOT be returned verbatim — they fall back to monthly×N (×0.8 @ 12mo).
    expect(resolvePlanPrice(prices, 3)).toBe(MONTHLY * 3);
    expect(resolvePlanPrice(prices, 6)).toBe(MONTHLY * 6);
    expect(resolvePlanPrice(prices, 12)).toBe(Math.floor(MONTHLY * 12 * 0.8));
    // none resolve to 0/free; the explicit positive monthly is still honored
    for (const p of [3, 6, 12]) expect(resolvePlanPrice(prices, p)).toBeGreaterThan(0);
    expect(resolvePlanPrice(prices, 1)).toBe(MONTHLY);
  });

  it("FIX-R2-05-B: a 0/non-positive monthly is not a fallback base → null (not free)", () => {
    expect(resolvePlanPrice([{ periodMonths: 1, priceKopeks: 0 }], 3)).toBeNull();
    expect(resolvePlanPrice([{ periodMonths: 1, priceKopeks: -100 }], 12)).toBeNull();
    // a 0 exact row with no monthly → null (never 0/free)
    expect(resolvePlanPrice([{ periodMonths: 3, priceKopeks: 0 }], 3)).toBeNull();
  });
});
