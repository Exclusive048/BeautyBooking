import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * 29.09 доработки · 16 (RKN-AUDIT-01) — добор данных визуального поиска у
 * мягко удалённых фото (исторические строки до изменения): пачка до 500, только
 * `deletedAt IS NOT NULL` — живые фото не трогаются никогда.
 *
 * @probe 2026-09-29 — в `purgeDeletedAssetVisualData` из выборки убрано условие
 *        `deletedAt: { not: null }`: красный «выбирает только
 *        удалённые фото». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(async () => ({ count: 0 })),
  embeddingDeleteMany: vi.fn(async () => ({ count: 0 })),
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/media/storage", () => ({ getStorageProvider: () => ({ deleteObject: vi.fn() }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { findMany: mocks.findMany, updateMany: mocks.updateMany },
    mediaAssetEmbedding: { deleteMany: mocks.embeddingDeleteMany },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import { DELETED_VISUAL_DATA_BATCH, purgeDeletedAssetVisualData } from "@/lib/media/cleanup";

beforeEach(() => {
  mocks.findMany.mockReset();
  mocks.updateMany.mockClear();
  mocks.embeddingDeleteMany.mockClear();
});

describe("purgeDeletedAssetVisualData", () => {
  it("выбирает только удалённые фото с оставшимися данными, пачкой до 500", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    await purgeDeletedAssetVisualData();
    const args = mocks.findMany.mock.calls[0][0];
    expect(args.where.deletedAt).toEqual({ not: null });
    expect(args.take).toBe(DELETED_VISUAL_DATA_BATCH);
    expect(DELETED_VISUAL_DATA_BATCH).toBe(500);
  });

  it("удаляет эмбеддинги и обнуляет visual* у найденных — и только у удалённых", async () => {
    mocks.findMany.mockResolvedValueOnce([{ id: "a1" }, { id: "a2" }]);
    const count = await purgeDeletedAssetVisualData();
    expect(count).toBe(2);
    expect(mocks.embeddingDeleteMany).toHaveBeenCalledWith({ where: { assetId: { in: ["a1", "a2"] } } });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2"] }, deletedAt: { not: null } },
      data: { visualDescription: null, visualMeta: Prisma.DbNull, visualCategory: null },
    });
  });

  it("нечего добирать — ничего не пишет", async () => {
    mocks.findMany.mockResolvedValueOnce([]);
    expect(await purgeDeletedAssetVisualData()).toBe(0);
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.embeddingDeleteMany).not.toHaveBeenCalled();
  });
});
