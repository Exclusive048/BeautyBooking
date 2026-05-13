import { describe, expect, it } from "vitest";
import { calculateMRR } from "@/lib/billing/mrr";

describe("calculateMRR", () => {
  it("returns 0 for an empty list", () => {
    expect(calculateMRR([])).toBe(0);
  });

  it("treats a 1-month subscription as its full price", () => {
    expect(
      calculateMRR([{ priceKopeks: 99_000, periodMonths: 1 }]),
    ).toBe(99_000);
  });

  it("amortises a 12-month subscription across 12 months", () => {
    // 1 200 000 kopeks / 12 = 100 000 kopeks/month
    expect(
      calculateMRR([{ priceKopeks: 1_200_000, periodMonths: 12 }]),
    ).toBe(100_000);
  });

  it("rounds halves up via Math.round semantics", () => {
    // 1000 / 3 = 333.33… → 333 (Math.round of 333.33)
    expect(calculateMRR([{ priceKopeks: 1000, periodMonths: 3 }])).toBe(333);
  });

  it("sums across multiple subscriptions", () => {
    expect(
      calculateMRR([
        { priceKopeks: 50_000, periodMonths: 1 },
        { priceKopeks: 90_000, periodMonths: 3 },
        { priceKopeks: 360_000, periodMonths: 12 },
      ]),
    ).toBe(50_000 + 30_000 + 30_000);
  });

  it("skips subscriptions with non-positive periodMonths", () => {
    expect(
      calculateMRR([
        { priceKopeks: 100_000, periodMonths: 0 },
        { priceKopeks: 100_000, periodMonths: -3 },
        { priceKopeks: 50_000, periodMonths: 1 },
      ]),
    ).toBe(50_000);
  });
});
