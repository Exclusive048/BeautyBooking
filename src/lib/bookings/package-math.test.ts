import { describe, expect, it } from "vitest";
import {
  proportionalDiscountedPrices,
  intraPackageOverlap,
  intraPackageOverlapMultiMaster,
} from "./package-math";
import { toKopeks } from "@/lib/money/kopeks";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Test boundary (MONEY-BRAND-TYPE-A): brand the raw kopeks inputs, then widen
// the branded `Kopeks[]` result back to `number[]` for the numeric assertions.
// Values are unchanged — this only annotates the units at the test boundary.
const pdp = (prices: number[], finalTotal: number): number[] =>
  proportionalDiscountedPrices(prices.map(toKopeks), toKopeks(finalTotal));

describe("proportionalDiscountedPrices", () => {
  it("empty input → empty output", () => {
    expect(pdp([], 0)).toEqual([]);
  });

  it("single component → gets the whole final total", () => {
    expect(pdp([5000], 4000)).toEqual([4000]);
  });

  it("no discount (final === total) → each component keeps its price", () => {
    const prices = [1000, 2000, 3000];
    expect(pdp(prices, 6000)).toEqual([1000, 2000, 3000]);
  });

  it("3 equal components, final 200 → Σ exactly 200 (two get 67, one 66)", () => {
    const out = pdp([100, 100, 100], 200);
    expect(sum(out)).toBe(200);
    expect([...out].sort()).toEqual([66, 67, 67]);
  });

  it("indivisible: 3 equal, final 100 → Σ exactly 100 (largest-remainder hands the kopek out)", () => {
    const out = pdp([100, 100, 100], 100);
    expect(sum(out)).toBe(100);
    expect([...out].sort()).toEqual([33, 33, 34]);
  });

  it("weighted split [1000,2000,3000] final 5000 → [833,1667,2500], Σ 5000", () => {
    const out = pdp([1000, 2000, 3000], 5000);
    expect(sum(out)).toBe(5000);
    expect(out).toEqual([833, 1667, 2500]);
  });

  it("all-free components → all zero", () => {
    expect(pdp([0, 0], 0)).toEqual([0, 0]);
  });

  it("proportional bias: larger component gets the larger share", () => {
    const out = pdp([100, 900], 500);
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
      const out = pdp(prices, final);
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

describe("intraPackageOverlapMultiMaster (by-client, studio)", () => {
  const comp = (
    startIso: string,
    endIso: string,
    masterProviderId: string | null,
    bufferMin: number,
  ) => ({
    startAtUtc: new Date(startIso),
    endAtUtc: new Date(endIso),
    masterProviderId,
    bufferMin,
  });

  it("single component → never overlaps", () => {
    expect(
      intraPackageOverlapMultiMaster([
        comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 15),
      ]),
    ).toBe(false);
  });

  it("🔴 same instant, DIFFERENT masters → REJECTED (one client can't be in two chairs)", () => {
    // The critical MVP-2 case. A naive by-master check would wrongly ALLOW this.
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 15),
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:30:00Z", "m2", 15),
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(true);
  });

  it("overlapping windows, different masters → rejected", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 30),
      comp("2026-07-08T10:30:00Z", "2026-07-08T11:30:00Z", "m2", 30),
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(true);
  });

  it("non-overlapping windows, different masters → ALLOWED (gaps OK)", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 30),
      comp("2026-07-08T13:00:00Z", "2026-07-08T14:00:00Z", "m2", 30),
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(false);
  });

  it("back-to-back, DIFFERENT masters → ALLOWED (buffer 0, client teleports)", () => {
    // Even though each master has a buffer, the cross-master constraint is
    // pure non-overlap — the client just walks to the next chair.
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 15),
      comp("2026-07-08T11:00:00Z", "2026-07-08T12:00:00Z", "m2", 15),
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(false);
  });

  it("SAME master twice, gap < buffer → overlap (master needs its buffer)", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 15),
      comp("2026-07-08T11:10:00Z", "2026-07-08T12:00:00Z", "m1", 15), // 10-min gap < 15
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(true);
  });

  it("SAME master twice, gap == buffer → allowed", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 15),
      comp("2026-07-08T11:15:00Z", "2026-07-08T12:00:00Z", "m1", 15), // 15-min gap
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(false);
  });

  it("SAME master twice, back-to-back (buffer 0) → allowed", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 0),
      comp("2026-07-08T11:00:00Z", "2026-07-08T12:00:00Z", "m1", 0),
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(false);
  });

  it("asymmetric buffers on same master → uses the larger buffer", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", "m1", 10),
      comp("2026-07-08T11:20:00Z", "2026-07-08T12:00:00Z", "m1", 30), // 20-min gap < 30
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(true);
  });

  it("3 components, mixed masters, the 1st and 3rd (different masters) overlap → detected pairwise", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T12:00:00Z", "m1", 15),
      comp("2026-07-08T13:00:00Z", "2026-07-08T13:30:00Z", "m2", 15),
      comp("2026-07-08T11:30:00Z", "2026-07-08T12:30:00Z", "m3", 15), // overlaps comp[0] in client time
    ];
    expect(intraPackageOverlapMultiMaster(components)).toBe(true);
  });

  it("null master ids are never treated as 'same master' (no buffer pad)", () => {
    const components = [
      comp("2026-07-08T10:00:00Z", "2026-07-08T11:00:00Z", null, 15),
      comp("2026-07-08T11:00:00Z", "2026-07-08T12:00:00Z", null, 15),
    ];
    // Two null-master back-to-back → buffer 0 (not same-master) → allowed.
    expect(intraPackageOverlapMultiMaster(components)).toBe(false);
  });
});
