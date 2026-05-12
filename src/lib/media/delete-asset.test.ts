import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, update, deleteObject, getStorageProvider, logError } = vi.hoisted(() => ({
  findUnique: vi.fn(),
  update: vi.fn(),
  deleteObject: vi.fn(),
  getStorageProvider: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: {
      findUnique,
      update,
    },
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

import { deleteAssetById } from "@/lib/media/service";

describe("media/deleteAssetById order-of-operations", () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
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
    deleteObject.mockImplementation(async () => {
      calls.push("storage.delete");
    });

    await deleteAssetById("asset-1");

    expect(calls).toEqual(["db.update", "storage.delete"]);
    expect(update).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: { deletedAt: expect.any(Date) },
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
});
