import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { moneyRUBFromKopeks, moneyRUBPlainFromKopeks } from "@/lib/format";

/**
 * QA-109 / FIX-03 regression tests — public surfaces must format kopecks ÷100.
 *
 * Background: prices are stored in KOPECKS. The cabinet/admin surfaces already
 * used ÷100 formatters, but ~9 public callsites formatted kopecks with the
 * non-÷100 `moneyRUB` / `moneyRUBPlain` / a local helper, rendering prices 100×
 * inflated (catalog "от 130 000 ₽" for a 1 300 ₽ service). FIX-03 swapped each
 * to the ÷100 equivalent.
 *
 * Two layers of guard:
 *  1. formatter-output: the ÷100 helpers the swapped sites now call produce the
 *     correct value for a known kopecks input.
 *  2. source-level: the fixed surfaces must NOT call the non-÷100 `moneyRUB(` /
 *     `moneyRUBPlain(` (the exact bug class — calling the wrong formatter on
 *     kopecks), and must carry their ÷100 fix marker. This catches a future
 *     re-introduction even if the rendered output isn't unit-rendered.
 *
 * NB: `Intl.NumberFormat("ru-RU")` uses a non-breaking space thousands
 * separator; we normalise whitespace to stay robust to ICU drift.
 */

function norm(value: string): string {
  return value.replace(/\s+/g, " ");
}

describe("moneyRUBFromKopeks — kopecks → '₽' (÷100, with symbol)", () => {
  it("formats a typical price (200 000 kopeks → 2 000 ₽)", () => {
    expect(norm(moneyRUBFromKopeks(200000))).toBe("2 000 ₽");
  });

  it("formats 130 000 kopeks → 1 300 ₽ (the QA-109 catalog example)", () => {
    expect(norm(moneyRUBFromKopeks(130000))).toBe("1 300 ₽");
  });

  it("returns 0 ₽ for zero", () => {
    expect(norm(moneyRUBFromKopeks(0))).toBe("0 ₽");
  });
});

describe("moneyRUBPlainFromKopeks — kopecks → plain number (÷100, no symbol)", () => {
  it("formats 250 000 kopeks → 2 500 (recent-masters)", () => {
    expect(norm(moneyRUBPlainFromKopeks(250000))).toBe("2 500");
  });

  it("carries no currency symbol", () => {
    expect(moneyRUBPlainFromKopeks(250000)).not.toContain("₽");
  });
});

describe("QA-109 source guard — public surfaces don't format kopecks with a non-÷100 formatter", () => {
  // Each fixed surface + the ÷100 marker it must now carry. The bare
  // `moneyRUB(` / `moneyRUBPlain(` calls (note the open-paren — does NOT match
  // `moneyRUBFromKopeks(` / `moneyRUBPlainFromKopeks(`) must be absent.
  const SITES: ReadonlyArray<{ file: string; marker: string }> = [
    { file: "src/features/catalog/components/catalog-card.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/catalog/components/catalog-map-carousel.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/catalog/components/histogram-slider.tsx", marker: "/ 100" },
    { file: "src/features/client-cabinet/bookings/client-bookings-page.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/client-cabinet/favorites/client-favorites-page.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/chat/chat-window/system-message.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/search-by-time/components/provider-result-card.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/public-studio/sections/details-section.tsx", marker: "moneyRUBFromKopeks(" },
    { file: "src/features/home/components/recent-masters-section.tsx", marker: "moneyRUBPlainFromKopeks(" },
  ];

  const NON_DIV100 = /\bmoneyRUB\(|\bmoneyRUBPlain\(/;

  for (const { file, marker } of SITES) {
    it(`${file} uses a ÷100 formatter, not the raw one`, () => {
      const src = readFileSync(join(process.cwd(), file), "utf8");
      expect(NON_DIV100.test(src), `${file} still calls a non-÷100 money formatter`).toBe(false);
      expect(src.includes(marker), `${file} missing ÷100 marker "${marker}"`).toBe(true);
    });
  }
});
