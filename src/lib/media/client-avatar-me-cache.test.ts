import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-CLIENT-01 — `GET /api/me` несёт аватар клиента и кэширует ответ
 * (`users/me.ts`, TTL 30 с), поэтому загрузка и удаление USER-аватара
 * сбрасывают кадр: иначе приложение после смены фото видело бы прежнее.
 * Другие загрузки кадр не трогают.
 *
 * @probe 2026-10-03 — сброс в `uploadMediaAsset` убран: покраснел «загрузка
 *        аватара клиента сбрасывает кадр /api/me». Возвращено — зелёный.
 */

const { aggregate, create, findUnique, findMany, findFirst, update } = vi.hoisted(() => ({
  aggregate: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  findFirst: vi.fn(),
  update: vi.fn(),
}));
const invalidateMeIdentityCache = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { aggregate, create, findUnique, findMany, findFirst, update, delete: vi.fn() },
    mediaAssetEmbedding: { deleteMany: vi.fn(async () => ({ count: 0 })) },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
    appSetting: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({ name: "test", putObject: vi.fn(), deleteObject: vi.fn() }),
}));
vi.mock("@/lib/media/preview-variants", () => ({ deleteMediaPreviews: vi.fn(async () => undefined) }));
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
vi.mock("@/lib/users/me", () => ({ invalidateMeIdentityCache }));

import { MediaEntityType, MediaKind } from "@prisma/client";
import type { UserProfile } from "@prisma/client";
import { deleteMediaAsset, uploadMediaAsset } from "@/lib/media/service";

const user = { id: "user-1" } as UserProfile;

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: "asset-1",
    entityType: MediaEntityType.USER,
    entityId: "user-1",
    kind: MediaKind.AVATAR,
    storageKey: "key-1",
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    originalFilename: "me.jpg",
    createdByUserId: "user-1",
    deletedAt: null,
    status: "READY",
    createdAt: new Date("2026-10-01T00:00:00Z"),
    cropX: null,
    cropY: null,
    cropWidth: null,
    cropHeight: null,
    ...overrides,
  };
}

function upload(entityType: MediaEntityType, kind: MediaKind, entityId = "user-1") {
  return uploadMediaAsset(user, {
    entityType,
    entityId,
    kind,
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    bytes: Buffer.from("x"),
    originalFilename: "me.jpg",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });
  findMany.mockResolvedValue([]);
  create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => asset({ ...data, id: "asset-new" }));
  update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => asset({ id: "asset-new", ...data }));
});

describe("кадр /api/me при смене аватара клиента", () => {
  it("загрузка аватара клиента сбрасывает кадр /api/me", async () => {
    await upload(MediaEntityType.USER, MediaKind.AVATAR);
    expect(invalidateMeIdentityCache).toHaveBeenCalledWith("user-1");
  });

  it("удаление аватара клиента сбрасывает кадр /api/me", async () => {
    findUnique.mockResolvedValue(asset());
    await deleteMediaAsset(user, "asset-1");
    expect(invalidateMeIdentityCache).toHaveBeenCalledWith("user-1");
  });

  it("фото к отклику на модель — кадр не трогается", async () => {
    await upload(MediaEntityType.USER, MediaKind.MODEL_APPLICATION_PHOTO);
    expect(invalidateMeIdentityCache).not.toHaveBeenCalled();
  });

  it("сбой сброса не отменяет загрузку", async () => {
    invalidateMeIdentityCache.mockRejectedValueOnce(new Error("redis down"));
    await expect(upload(MediaEntityType.USER, MediaKind.AVATAR)).resolves.toMatchObject({ id: "asset-new" });
  });
});
