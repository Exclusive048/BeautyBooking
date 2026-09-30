import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 01-в — «Заменить» у фото работы мастера: строка работы
 * (услуги, теги, порядок, видимость) переезжает на новый файл, как у студии.
 * Порядок «сохранить новое → перенести работу → удалить старое» пиннит
 * `replace-order.test.ts`.
 *
 * @probe 2026-09-29 — из условия переноса убран `MediaEntityType.MASTER`
 * (перенос только для студии, как было): покраснел «строка работы мастера
 * переезжает на новый файл». Возвращено — зелёный.
 */

const { aggregate, create, findUnique, findMany, update, del, updateMany } = vi.hoisted(() => ({
  aggregate: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  del: vi.fn(),
  updateMany: vi.fn(),
}));
const calls = vi.hoisted(() => [] as string[]);
const invalidateStoriesCache = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { aggregate, create, findUnique, findMany, update, delete: del },
    portfolioItem: { updateMany },
    appSetting: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({ name: "test", putObject: vi.fn(), deleteObject: vi.fn() }),
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
vi.mock("@/lib/feed/stories.service", () => ({ invalidateStoriesCache }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { MediaEntityType, MediaKind } from "@prisma/client";
import type { UserProfile } from "@prisma/client";

import { uploadMediaAsset } from "@/lib/media/service";

const user = { id: "user-1" } as UserProfile;
const OLD = {
  id: "old-asset",
  entityType: MediaEntityType.MASTER,
  entityId: "master-prov",
  kind: MediaKind.PORTFOLIO,
  storageKey: "old-key",
  mimeType: "image/jpeg",
  sizeBytes: 1000,
  originalFilename: "old.jpg",
  createdByUserId: "user-1",
  deletedAt: null,
  createdAt: new Date("2026-09-01T00:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  findUnique.mockImplementation(async ({ where }: { where: { id: string } }) =>
    where.id === OLD.id ? OLD : null,
  );
  findMany.mockResolvedValue([]);
  aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });
  const fresh = { ...OLD, id: "new-asset", storageKey: "new-key" };
  create.mockResolvedValue(fresh);
  update.mockImplementation(async (arg: { where: { id: string }; data: Record<string, unknown> }) => {
    calls.push(arg.data.deletedAt ? `delete:${arg.where.id}` : `ready:${arg.where.id}`);
    return { ...fresh, ...arg.data };
  });
  updateMany.mockImplementation(async () => {
    calls.push("carry");
    return { count: 1 };
  });
});

describe("uploadMediaAsset — замена фото работы мастера", () => {
  it("строка работы мастера переезжает на новый файл", async () => {
    await uploadMediaAsset(user, {
      entityType: MediaEntityType.MASTER,
      entityId: "master-prov",
      kind: MediaKind.PORTFOLIO,
      mimeType: "image/jpeg",
      sizeBytes: 1000,
      bytes: Buffer.from("x"),
      originalFilename: "new.jpg",
      replaceAssetId: OLD.id,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { masterId: "master-prov", mediaUrl: { contains: "old-asset" } },
      data: { mediaUrl: "/api/media/file/new-asset" },
    });
    // перенос — до удаления старого файла
    expect(calls).toEqual(["ready:new-asset", "carry", "delete:old-asset"]);
    expect(invalidateStoriesCache).toHaveBeenCalled();
  });
});
