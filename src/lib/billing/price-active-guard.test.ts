import { describe, expect, it } from "vitest";
import { findOrphanedOfferedPeriod } from "@/lib/billing/price-active-guard";

/**
 * BILLING-PRICE-ACTIVE-UI-01 (R2-05-J) — the last-active-row guard. Pins that
 * deactivating a price never strands an OFFERED period (no active exact row +
 * no active monthly anchor), while deactivating a period covered by the monthly
 * fallback stays allowed. Same rule the admin PATCH route enforces server-side.
 */

const price = (periodMonths: number, priceKopeks: number, isActive: boolean) => ({
  periodMonths,
  priceKopeks,
  isActive,
});

describe("findOrphanedOfferedPeriod", () => {
  it("returns null when all offered periods are active", () => {
    expect(
      findOrphanedOfferedPeriod([
        price(1, 100_000, true),
        price(3, 270_000, true),
        price(12, 960_000, true),
      ]),
    ).toBeNull();
  });

  it("allows deactivating a 3-month row while monthly is active (monthly fallback covers it)", () => {
    // 3mo deactivated but kept (price>0) → resolves via monthly×3 → not orphaned.
    expect(
      findOrphanedOfferedPeriod([
        price(1, 100_000, true),
        price(3, 270_000, false),
      ]),
    ).toBeNull();
  });

  it("blocks deactivating the monthly anchor when other periods rely on it", () => {
    // 1mo offered (price>0) but deactivated, no other active exact rows →
    // the 1-month period itself resolves to null → orphaned.
    expect(
      findOrphanedOfferedPeriod([
        price(1, 100_000, false),
        price(3, 270_000, false),
      ]),
    ).toBe(1);
  });

  it("blocks deactivating the monthly even when 3/6/12 have active exact rows (1mo stranded)", () => {
    // 3/6/12 resolve via their own active exact rows, but the offered 1-month
    // period has no active row + no monthly anchor → orphaned at 1.
    expect(
      findOrphanedOfferedPeriod([
        price(1, 100_000, false),
        price(3, 270_000, true),
        price(6, 510_000, true),
        price(12, 960_000, true),
      ]),
    ).toBe(1);
  });

  it("blocks deactivating an annual-only plan's sole 12-month row", () => {
    expect(findOrphanedOfferedPeriod([price(12, 960_000, false)])).toBe(12);
  });

  it("treats a zeroed period as intentionally removed (not offered) → not orphaned", () => {
    // Zeroing the monthly removes it (delete path); the 12mo active exact row
    // still resolves; the zeroed 1-month period is not offered → no orphan.
    expect(
      findOrphanedOfferedPeriod([
        price(1, 0, true),
        price(12, 960_000, true),
      ]),
    ).toBeNull();
  });

  it("treats absent isActive as active (create-default / UI always sends it)", () => {
    expect(
      findOrphanedOfferedPeriod([
        { periodMonths: 1, priceKopeks: 100_000 },
        { periodMonths: 3, priceKopeks: 270_000 },
      ]),
    ).toBeNull();
  });
});
