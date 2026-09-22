import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Поиск по фото: исходы, которые пользователь видит, и их кэширование.
 *
 *   · VISUAL-SEARCH-TRANSIENT-01 — отказ провайдера отдаётся как `unavailable`,
 *     а не как «не поняли, что на фото»;
 *   · VISUAL-SEARCH-CACHE-01 — сутки кэшируется только то, что зависит от
 *     самого фото; отказ провайдера не кэшируется вовсе;
 *   · VISUAL-SEARCH-RANK-01 — мастер без отзывов не обнуляется в ранжировании.
 *
 * @probe 2026-09-22 — в `searcher.ts` `ratingFactor` возвращён к
 * `Math.max(0, ratingAvg) / 5`: красными стали оба кейса множителя рейтинга
 * (`expected 0 to be greater than 0`). Возвращён — зелёные. `case "unavailable"`
 * в `byPhotoCacheTtlSeconds`, заменённый на сутки, красит кейс кэша.
 */

const mocks = vi.hoisted(() => ({ classifyImage: vi.fn() }));

vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/cache/cache", () => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/visual-search/config", () => ({ assertVisualSearchEnabled: vi.fn(async () => {}) }));
vi.mock("@/lib/visual-search/classifier", () => ({ classifyImage: mocks.classifyImage }));
vi.mock("@/lib/visual-search/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/visual-search/provider")>()),
  resizeForVision: vi.fn(async (bytes: Uint8Array) => bytes),
}));

import { ratingFactor, searchByImage } from "@/lib/visual-search/searcher";
import { byPhotoCacheTtlSeconds } from "@/lib/visual-search/by-photo-guards";
import { VisualProviderUnavailableError } from "@/lib/visual-search/provider";

beforeEach(() => {
  mocks.classifyImage.mockReset();
});

describe("VISUAL-SEARCH-TRANSIENT-01 · поиск", () => {
  it("провайдер не ответил → unavailable, а не unrecognized", async () => {
    mocks.classifyImage.mockRejectedValueOnce(
      new VisualProviderUnavailableError("vision", new TypeError("fetch failed"))
    );
    await expect(searchByImage(new Uint8Array([1]))).resolves.toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("чужие ошибки не маскируются под unavailable", async () => {
    mocks.classifyImage.mockRejectedValueOnce(new Error("db down"));
    await expect(searchByImage(new Uint8Array([1]))).rejects.toThrow("db down");
  });
});

describe("VISUAL-SEARCH-CACHE-01 · срок хранения ответа", () => {
  it("зависит от исхода", () => {
    const day = 24 * 60 * 60;
    expect(byPhotoCacheTtlSeconds({ ok: true, results: [], category: "manicure" })).toBe(day);
    expect(byPhotoCacheTtlSeconds({ ok: false, reason: "unrecognized" })).toBe(day);
    expect(byPhotoCacheTtlSeconds({ ok: false, reason: "low_confidence" })).toBe(day);
    const notEnough = byPhotoCacheTtlSeconds({ ok: false, reason: "not_enough_indexed" });
    expect(notEnough).not.toBeNull();
    expect(notEnough!).toBeLessThan(day);
    expect(byPhotoCacheTtlSeconds({ ok: false, reason: "unavailable" })).toBeNull();
  });
});

describe("VISUAL-SEARCH-RANK-01 · множитель рейтинга", () => {
  it("мастер без отзывов не обнуляется", () => {
    expect(ratingFactor(0)).toBeGreaterThan(0);
    expect(ratingFactor(Number.NaN)).toBe(ratingFactor(0));
  });

  it("рейтинг подталкивает, но не решает: точное совпадение без отзывов выше слабого с 5.0", () => {
    expect(ratingFactor(5)).toBe(1);
    expect(ratingFactor(4)).toBeGreaterThan(ratingFactor(3));
    expect(ratingFactor(1)).toBeGreaterThan(0);
    // Счёт = похожесть × … × множитель рейтинга.
    expect(0.9 * ratingFactor(0)).toBeGreaterThan(0.6 * ratingFactor(5));
  });
});
