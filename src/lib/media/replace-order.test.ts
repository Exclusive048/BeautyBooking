import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 00-13 — замена фото: старое удаляется ПОСЛЕ того, как новое
 * сохранено. Раньше — до загрузки, и при сбое загрузки работа оставалась с
 * битой картинкой (у аватара — профиль без аватара).
 *
 * @probe 2026-09-29 — удаление заменяемого возвращено ДО загрузки (как было):
 * покраснел «сбой загрузки — старое фото остаётся» (старое помечено удалённым).
 * Возвращено — зелёный.
 * @probe 2026-09-29 — освобождаемые байты не вычитаются из квоты: покраснел
 * «замена проходит на границе квоты» (409). Возвращено — зелёный.
 */

const { aggregate, create, findUnique, findMany, update, del } = vi.hoisted(() => ({
  aggregate: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
}));
const putObject = vi.hoisted(() => vi.fn());
const deleteObject = vi.hoisted(() => vi.fn());
const calls = vi.hoisted(() => [] as string[]);

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { aggregate, create, findUnique, findMany, update, delete: del },
    // 29.09 доработки · 16: мягкое удаление идёт одной транзакцией с эмбеддингом.
    mediaAssetEmbedding: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    appSetting: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({ name: "test", putObject, deleteObject }),
}));
vi.mock("@/lib/media/access", () => ({
  canManageProvider: vi.fn(),
  ensureCanManageMedia: vi.fn(),
  ensureCanReadMedia: vi.fn(),
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn(async () => undefined) }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { MediaEntityType, MediaKind } from "@prisma/client";
import type { UserProfile } from "@prisma/client";

import { uploadMediaAsset } from "@/lib/media/service";
import { MEDIA_USER_STORAGE_QUOTA_BYTES } from "@/lib/media/types";

const user = { id: "user-1" } as UserProfile;

const OLD = {
  id: "old-asset",
  entityType: MediaEntityType.CLIENT_CARD,
  entityId: "card-1",
  kind: MediaKind.CLIENT_CARD_PHOTO,
  storageKey: "old-key",
  mimeType: "image/jpeg",
  sizeBytes: 2048,
  originalFilename: "old.jpg",
  createdByUserId: "user-1",
  deletedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

function replaceUpload() {
  return uploadMediaAsset(user, {
    entityType: MediaEntityType.CLIENT_CARD,
    entityId: "card-1",
    kind: MediaKind.CLIENT_CARD_PHOTO,
    mimeType: "image/jpeg",
    sizeBytes: 2048,
    bytes: Buffer.from("x"),
    originalFilename: "new.jpg",
    replaceAssetId: OLD.id,
  });
}

function oldMarkedDeleted(): boolean {
  return update.mock.calls.some(
    ([arg]) => arg?.where?.id === OLD.id && arg?.data?.deletedAt instanceof Date,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === OLD.id ? OLD : null,
  );
  findMany.mockResolvedValue([]);
  aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });
  const fresh = { ...OLD, id: "new-asset", storageKey: "new-key", originalFilename: "new.jpg" };
  create.mockResolvedValue(fresh);
  update.mockImplementation(async (arg: { where: { id: string }; data: Record<string, unknown> }) => {
    calls.push(arg.data.deletedAt ? `delete:${arg.where.id}` : `ready:${arg.where.id}`);
    return { ...fresh, ...arg.data };
  });
  putObject.mockImplementation(async () => {
    calls.push("put");
  });
  del.mockResolvedValue(undefined);
});

describe("uploadMediaAsset — замена фото", () => {
  it("сбой загрузки — старое фото остаётся", async () => {
    putObject.mockRejectedValue(new Error("S3 down"));

    await expect(replaceUpload()).rejects.toThrow("S3 down");
    expect(oldMarkedDeleted()).toBe(false);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("успех — старое удаляется после того, как новое сохранено", async () => {
    await replaceUpload();

    expect(calls).toEqual(["put", "ready:new-asset", "delete:old-asset"]);
    expect(deleteObject).toHaveBeenCalledWith("old-key");
  });

  it("замена проходит на границе квоты — заменяемое своё фото не считается", async () => {
    aggregate.mockResolvedValue({ _sum: { sizeBytes: MEDIA_USER_STORAGE_QUOTA_BYTES } });

    await expect(replaceUpload()).resolves.toBeDefined();
  });
});
