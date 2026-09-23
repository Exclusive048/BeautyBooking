import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VISUAL-SEARCH-UNRECOGNIZED-01 — выдача есть, как только в категории есть хоть
 * одна проиндексированная работа. Раньше порог «не меньше 5 работ» на старте
 * давал «Пока мало работ» даже на фото самой проиндексированной работы.
 * Ослабление строгих фильтров по-прежнему срабатывает при <5 кандидатах.
 *
 * @probe 2026-09-23 — `MIN_FILTERED_ASSETS` возвращён к 5: красный «одна
 * работа категории — выдача есть». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  providerFindMany: vi.fn(),
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw, provider: { findMany: mocks.providerFindMany } },
}));
vi.mock("@/lib/visual-search/config", () => ({ assertVisualSearchEnabled: vi.fn(async () => {}) }));
vi.mock("@/lib/visual-search/classifier", () => ({
  classifyImage: vi.fn(async () => ({ category: "manicure", confidence: "high" })),
}));
vi.mock("@/lib/visual-search/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/visual-search/provider")>()),
  resizeForVision: vi.fn(async (bytes: Uint8Array) => bytes),
  describeImageWithStrategy: vi.fn(async () => ({
    text_description: "Нюдовый маникюр с блёстками.",
    meta: { shape: "овал", style: "классика" },
  })),
  createQueryEmbedding: vi.fn(async () => Array.from({ length: 256 }, () => 0.1)),
}));

import { searchByImage } from "@/lib/visual-search/searcher";

const ASSET = { id: "asset-1", entityId: "prov-1", createdAt: new Date() };

beforeEach(() => {
  mocks.queryRaw.mockReset();
  mocks.providerFindMany.mockReset();
  mocks.providerFindMany.mockResolvedValue([
    { id: "prov-1", name: "Анна", publicUsername: "anna", avatarUrl: null, ratingAvg: 0 },
  ]);
});

describe("поиск по фото · порог выдачи", () => {
  it("одна работа категории — выдача есть", async () => {
    mocks.queryRaw
      .mockResolvedValueOnce([]) // строгий отбор по фильтрам
      .mockResolvedValueOnce([ASSET]) // ослабленный отбор
      .mockResolvedValueOnce([{ assetId: "asset-1", similarity: 0.93 }]); // похожесть
    const result = await searchByImage(new Uint8Array([1]));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results.map((r) => r.provider.publicUsername)).toEqual(["anna"]);
    }
  });

  it("ни одной работы категории — «мало работ»", async () => {
    mocks.queryRaw.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(searchByImage(new Uint8Array([1]))).resolves.toEqual({
      ok: false,
      reason: "not_enough_indexed",
    });
  });
});
