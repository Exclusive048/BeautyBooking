import { describe, expect, it } from "vitest";
import { UI_FMT } from "@/lib/ui/fmt";

/**
 * Money-formatter regression tests (fix-01).
 *
 * Background: `UI_FMT.priceLabel` historically did not divide by 100,
 * which produced "200 000 ₽" instead of "2 000 ₽" on the master
 * dashboard. The fix locks the kopeks-in convention with these
 * cases.
 *
 * NB: `Intl.NumberFormat("ru-RU")` uses a non-breaking space as the
 * thousands separator. We use a regex strip below to avoid the test
 * being brittle to ICU version drift between Node releases.
 */

function stripSeparators(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("UI_FMT.priceLabel — kopeks → rubles formatting", () => {
  it("formats a typical price (200 000 kopeks → 2 000 ₽)", () => {
    expect(stripSeparators(UI_FMT.priceLabel(200000))).toBe("2 000 ₽");
  });

  it("rounds half-up (450 050 kopeks → 4 501 ₽)", () => {
    expect(stripSeparators(UI_FMT.priceLabel(450050))).toBe("4 501 ₽");
  });

  it("returns 0 ₽ for zero", () => {
    expect(UI_FMT.priceLabel(0)).toBe("0 ₽");
  });

  it("returns 0 ₽ for negative values (defensive)", () => {
    expect(UI_FMT.priceLabel(-100)).toBe("0 ₽");
  });

  it("rounds 50 kopeks up to 1 ₽", () => {
    // 50 kopeks = 0.5 rubles → Math.round(0.5) → 1 (HALF_TO_EVEN
    // in some platforms, but Math.round always rounds half-up).
    expect(stripSeparators(UI_FMT.priceLabel(50))).toBe("1 ₽");
  });

  it("formats 1 000 kopeks → 10 ₽", () => {
    expect(stripSeparators(UI_FMT.priceLabel(1000))).toBe("10 ₽");
  });

  it("formats large amounts with thousands separator", () => {
    expect(stripSeparators(UI_FMT.priceLabel(12_345_600))).toBe("123 456 ₽");
  });
});

describe("UI_FMT.totalLabel — kopeks → 'Итого: X XXX ₽'", () => {
  it("formats a typical sum", () => {
    expect(stripSeparators(UI_FMT.totalLabel(200000))).toBe("Итого: 2 000 ₽");
  });

  it("returns 'Итого: 0 ₽' for zero", () => {
    expect(UI_FMT.totalLabel(0)).toBe("Итого: 0 ₽");
  });
});

describe("UI_FMT.priceDurationLabel — combined", () => {
  it("formats both parts", () => {
    expect(stripSeparators(UI_FMT.priceDurationLabel(350000, 60))).toBe(
      "3 500 ₽ • 1 ч",
    );
  });
});

describe("UI_FMT.durationLabel — minutes (unchanged convention)", () => {
  it("renders hours when divisible by 60", () => {
    expect(UI_FMT.durationLabel(60)).toBe("1 ч");
    expect(UI_FMT.durationLabel(120)).toBe("2 ч");
  });

  it("renders minutes otherwise", () => {
    expect(UI_FMT.durationLabel(45)).toBe("45 мин");
    expect(UI_FMT.durationLabel(90)).toBe("90 мин");
  });

  it("returns '0 мин' for zero or negative", () => {
    expect(UI_FMT.durationLabel(0)).toBe("0 мин");
    expect(UI_FMT.durationLabel(-10)).toBe("0 мин");
  });
});
