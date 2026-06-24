import { describe, expect, it } from "vitest";
import { proportionalDiscountedPrices, intraPackageOverlap } from "./package-math";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe("proportionalDiscountedPrices", () => {
  it("empty input → empty output", () => {
    expect(proportionalDiscountedPrices([], 0)).toEqual([]);
  });

  it("single component → gets the whole final total", () => {
    expect(proportionalDiscountedPrices([5000], 4000)).toEqual([4000]);
  });

  it("no discount (final === total) → each component keeps its price", () => {
    const prices = [1000, 2000, 3000];
    expect(proportionalDiscountedPrices(prices, 6000)).toEqual([1000, 2000, 3000]);
  });

  it("3 equal components, final 200 → Σ exactly 200 (two get 67, one 66)", () => {
    const out = proportionalDiscountedPrices([100, 100, 100], 200);
    expect(sum(out)).toBe(200);
    expect([...out].sort()).toEqual([66, 67, 67]);
  });

  it("indivisible: 3 equal, final 100 → Σ exactly 100 (largest-remainder hands the kopek out)", () => {
    const out = proportionalDiscountedPrices([100, 100, 100], 100);
    expect(sum(out)).toBe(100);
    expect([...out].sort()).toEqual([33, 33, 34]);
  });

  it("weighted split [1000,2000,3000] final 5000 → [833,1667,2500], Σ 5000", () => {
    const out = proportionalDiscountedPrices([1000, 2000, 3000], 5000);
    expect(sum(out)).toBe(5000);
    expect(out).toEqual([833, 1667, 2500]);
  });

  it("all-free components → all zero", () => {
    expect(proportionalDiscountedPrices([0, 0], 0)).toEqual([0, 0]);
  });

  it("proportional bias: larger component gets the larger share", () => {
    const out = proportionalDiscountedPrices([100, 900], 500);
    expect(sum(out)).toBe(500);
    expect(out[1]).toBeGreaterThan(out[0]!);
  });

  it("property: Σ === finalTotal across many odd splits", () => {
    const cases: Array<[number[], number]> = [
      [[333, 333, 334], 700],
      [[1, 1, 1, 1, 1], 3],
      [[2200, 3500, 3800], 8000],
      [[100, 200, 300, 400], 777],
      [[7, 11, 13], 19],
    ];
    for (const [prices, final] of cases) {
      const out = proportionalDiscountedPrices(prices, final);
      expect(sum(out)).toBe(final);
      expect(out.every((x) => x >= 0)).toBe(true);
    }
  });
});

describe("intraPackageOverlap", () => {
  const slot = (startIso: string, endIso: string) => ({
    startAtUtc: new Date(startIso),
    endAtUtc: new Date(endIso),
  });

  it("single slot → never overlaps", () => {
    expect(intraPackageOverlap([slot("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z")], 15)).toBe(false);
  });

  it("gap exactly equals buffer → allowed (no overlap)", () => {
    const slots = [
      slot("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z"),
      slot("2026-07-08T11:15:00Z", "2026-07-08T12:00:00Z"), // 15-min gap
    ];
    expect(intraPackageOverlap(slots, 15)).toBe(false);
  });

  it("gap smaller than buffer → overlap", () => {
    const slots = [
      slot("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z"),
      slot("2026-07-08T11:10:00Z", "2026-07-08T12:00:00Z"), // 10-min gap < 15
    ];
    expect(intraPackageOverlap(slots, 15)).toBe(true);
  });

  it("truly overlapping times → overlap (any buffer)", () => {
    const slots = [
      slot("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z"),
      slot("2026-07-08T10:30:00Z", "2026-07-08T11:30:00Z"),
    ];
    expect(intraPackageOverlap(slots, 0)).toBe(true);
  });

  it("buffer 0, exactly back-to-back (end === next start) → allowed", () => {
    const slots = [
      slot("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z"),
      slot("2026-07-08T11:00:00Z", "2026-07-08T12:00:00Z"),
    ];
    expect(intraPackageOverlap(slots, 0)).toBe(false);
  });

  it("non-contiguous (large gap) → allowed", () => {
    const slots = [
      slot("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z"),
      slot("2026-07-08T15:00:00Z", "2026-07-08T16:00:00Z"),
    ];
    expect(intraPackageOverlap(slots, 15)).toBe(false);
  });

  it("3 components, the 1st and 3rd overlap → detected (pairwise, not just adjacent)", () => {
    const slots = [
      slot("2026-07-08T10:00:00Z", "2026-07-08T12:00:00Z"),
      slot("2026-07-08T13:00:00Z", "2026-07-08T13:30:00Z"),
      slot("2026-07-08T11:30:00Z", "2026-07-08T12:30:00Z"), // overlaps slot[0]
    ];
    expect(intraPackageOverlap(slots, 0)).toBe(true);
  });
});
