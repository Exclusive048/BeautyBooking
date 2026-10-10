import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, update, updateMany, embeddingDeleteMany, deleteObject, getStorageProvider, logError } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  embeddingDeleteMany: vi.fn(),
  deleteObject: vi.fn(),
  getStorageProvider: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: {
      findUnique,
      update,
      updateMany,
    },
    mediaAssetEmbedding: { deleteMany: embeddingDeleteMany },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

vi.mock("@/lib/media/storage", () => ({
  getStorageProvider,
}));

vi.mock("@/lib/logging/logger", () => ({
  logError,
  logInfo: vi.fn(),
}));

// The remaining deps of service.ts don't need real implementations for these tests.
vi.mock("@/lib/api/errors", () => ({
  AppError: class AppError extends Error {
    constructor(message: string, public status: number, public code: string) {
      super(message);
    }
  },
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/media/access", () => ({
  ensureCanManageMedia: vi.fn(),
  ensureCanReadMedia: vi.fn(),
}));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn() }));

import { Prisma } from "@prisma/client";
import { deleteAssetById } from "@/lib/media/service";
import { MEDIA_PREVIEW_WIDTHS, mediaPreviewStorageKey } from "@/lib/media/preview-variants";

describe("media/deleteAssetById order-of-operations", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
    embeddingDeleteMany.mockReset();
    embeddingDeleteMany.mockResolvedValue({ count: 0 });
    deleteObject.mockReset();
    getStorageProvider.mockReset();
    logError.mockReset();

    getStorageProvider.mockReturnValue({ name: "test", deleteObject });
  });

  it("returns silently when asset is missing or already soft-deleted", async () => {
    findUnique.mockResolvedValueOnce(null);
    await deleteAssetById("missing");
    expect(update).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();

    findUnique.mockResolvedValueOnce({
      id: "deleted",
      storageKey: "k",
      deletedAt: new Date(),
    });
    await deleteAssetById("deleted");
    expect(update).not.toHaveBeenCalled();
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("marks the row deleted in DB BEFORE calling storage.deleteObject", async () => {
    const calls: string[] = [];
    findUnique.mockResolvedValue({
      id: "asset-1",
      storageKey: "key/abc.jpg",
      deletedAt: null,
    });
    update.mockImplementation(async () => {
      calls.push("db.update");
      return {};
    });
    deleteObject.mockImplementation(async (key: string) => {
      calls.push(key === "key/abc.jpg" ? "storage.delete" : "storage.delete-preview");
    });

    await deleteAssetById("asset-1");

    // MOBILE-B1: следом за оригиналом — весь набор превью `?w=`, тоже после
    // пометки строки (иначе параллельный запрос записал бы вариант удалённого).
    expect(calls).toEqual([
      "db.update",
      "storage.delete",
      ...MEDIA_PREVIEW_WIDTHS.map(() => "storage.delete-preview"),
    ]);
    for (const width of MEDIA_PREVIEW_WIDTHS) {
      expect(deleteObject).toHaveBeenCalledWith(mediaPreviewStorageKey("key/abc.jpg", width));
    }
    expect(update).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(deleteObject).toHaveBeenCalledWith("key/abc.jpg");
  });

  it("does not throw when storage.deleteObject fails — logs the error and resolves", async () => {
    findUnique.mockResolvedValue({
      id: "asset-2",
      storageKey: "key/xyz.jpg",
      deletedAt: null,
    });
    update.mockResolvedValue({});
    deleteObject.mockRejectedValue(new Error("S3 transient outage"));

    await expect(deleteAssetById("asset-2")).resolves.toBeUndefined();

    expect(update).toHaveBeenCalled();
    expect(deleteObject).toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("Failed to delete media object from storage"),
      expect.objectContaining({
        assetId: "asset-2",
        storageKey: "key/xyz.jpg",
      }),
    );
  });

  // 29.09 доработки · 16 (RKN-AUDIT-01): вместе с `deletedAt` — одной
  // транзакцией — уходят данные, выведенные из фото для визуального поиска.
  it("вместе с deletedAt удаляет эмбеддинг и обнуляет visual* (visualIndexed не трогает)", async () => {
    findUnique.mockResolvedValue({ id: "asset-3", storageKey: "k3", deletedAt: null });
    update.mockResolvedValue({});
    deleteObject.mockResolvedValue(undefined);

    await deleteAssetById("asset-3");

    const data = update.mock.calls[0][0].data as Record<string, unknown>;
    expect(data.visualDescription).toBeNull();
    expect(data.visualCategory).toBeNull();
    expect(data.visualMeta).toBe(Prisma.DbNull);
    expect(data).not.toHaveProperty("visualIndexed");
    expect(embeddingDeleteMany).toHaveBeenCalledWith({ where: { assetId: "asset-3" } });
  });
});

// MEDIA-STORAGE-ORPHAN-SWEEP: отметка «байты убраны» — только когда из хранилища
// ушли и оригинал, и превью. Без неё удаление повторит ежечасная уборка.
//
// @probe 2026-10-10: в `deleteAssetById` снят `storageCleared = false` в ветке
// оригинала — красный «хранилище не удалило оригинал» (сначала проба прошла
// зелёной: тест ронял и превью, и отметку снимала вторая ветка — отказ сужен до
// оригинала); то же в ветке превью — красный «оригинал удалён, превью — нет».
// Восстановлено, 8/8 зелёно.
describe("media/deleteAssetById — отметка storageDeletedAt", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
    update.mockResolvedValue({});
    updateMany.mockReset();
    updateMany.mockResolvedValue({ count: 1 });
    embeddingDeleteMany.mockReset();
    embeddingDeleteMany.mockResolvedValue({ count: 0 });
    deleteObject.mockReset();
    getStorageProvider.mockReset();
    getStorageProvider.mockReturnValue({ name: "test", deleteObject });
    logError.mockReset();
    findUnique.mockResolvedValue({ id: "asset-9", storageKey: "key/9.jpg", deletedAt: null });
  });

  it("оригинал и превью удалены — отметка ставится у мягко удалённой строки", async () => {
    deleteObject.mockResolvedValue(undefined);

    await deleteAssetById("asset-9");

    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "asset-9", deletedAt: { not: null }, storageDeletedAt: null },
      data: { storageDeletedAt: expect.any(Date) },
    });
  });

  it("хранилище не удалило оригинал — отметки нет (уборка повторит)", async () => {
    // Отказывает только оригинал: превью удалились, отметку обязан снять
    // именно сбой оригинала.
    deleteObject.mockImplementation(async (key: string) => {
      if (key === "key/9.jpg") throw new Error("TenantSuspended");
    });

    await expect(deleteAssetById("asset-9")).resolves.toBeUndefined();

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("оригинал удалён, превью — нет: отметки тоже нет", async () => {
    deleteObject.mockImplementation(async (key: string) => {
      if (key !== "key/9.jpg") throw new Error("preview delete failed");
    });

    await deleteAssetById("asset-9");

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("сбой самой отметки не роняет удаление", async () => {
    deleteObject.mockResolvedValue(undefined);
    updateMany.mockRejectedValue(new Error("db down"));

    await expect(deleteAssetById("asset-9")).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledWith(
      "Failed to mark media storage as deleted",
      expect.objectContaining({ assetId: "asset-9" }),
    );
  });
});
