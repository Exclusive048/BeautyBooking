import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SEC-17 — штучные лимиты были только у портфолио (план) и аватара (замена).
 * Фото клиентской карточки ограничены тремя НА КАРТОЧКУ, а карточка заводится
 * из `clientKey`, который присылает сам вызывающий, — лимит обходится
 * добавлением карточек. Байтового учёта не было нигде.
 *
 * Здесь пиннится и решение (чистая функция), и семантика запроса: сумма берётся
 * по ЖИВЫМ ассетам аккаунта. Обе половины ломаются независимо, поэтому обе
 * проверяются.
 */

const { aggregate, create, findUnique, findMany, update } = vi.hoisted(() => ({
  aggregate: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { aggregate, create, findUnique, findMany, update },
    appSetting: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({
    name: "test",
    putObject: vi.fn(),
    deleteObject: vi.fn(),
  }),
}));
vi.mock("@/lib/media/access", () => ({
  canManageProvider: vi.fn(),
  ensureCanManageMedia: vi.fn(),
  ensureCanReadMedia: vi.fn(),
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/queue/queue", () => ({ enqueue: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { MediaEntityType, MediaKind } from "@prisma/client";
import type { UserProfile } from "@prisma/client";

import { exceedsStorageQuota, uploadMediaAsset } from "@/lib/media/service";
import { MEDIA_USER_STORAGE_QUOTA_BYTES } from "@/lib/media/types";

const user = { id: "user-1" } as UserProfile;

function upload() {
  return uploadMediaAsset(user, {
    entityType: MediaEntityType.CLIENT_CARD,
    entityId: "card-1",
    kind: MediaKind.CLIENT_CARD_PHOTO,
    mimeType: "image/jpeg",
    sizeBytes: 1024,
    bytes: Buffer.from("x"),
    originalFilename: "photo.jpg",
  });
}

describe("exceedsStorageQuota — решение", () => {
  it("пропускает, пока сумма с новым файлом укладывается в квоту", () => {
    expect(
      exceedsStorageQuota({ usedBytes: 10, incomingBytes: 5, quotaBytes: 20 }),
    ).toBe(false);
  });

  it("пропускает ровно на границе", () => {
    expect(
      exceedsStorageQuota({ usedBytes: 15, incomingBytes: 5, quotaBytes: 20 }),
    ).toBe(false);
  });

  it("учитывает ВХОДЯЩИЙ файл, а не только уже занятое", () => {
    // пустая квота проверялась бы как «занято < квоты» и пускала бы любой файл
    expect(
      exceedsStorageQuota({ usedBytes: 19, incomingBytes: 5, quotaBytes: 20 }),
    ).toBe(true);
  });

  it("по умолчанию берёт общий потолок аккаунта", () => {
    expect(
      exceedsStorageQuota({ usedBytes: MEDIA_USER_STORAGE_QUOTA_BYTES, incomingBytes: 1 }),
    ).toBe(true);
  });
});

describe("uploadMediaAsset — квота аккаунта (SEC-17)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findMany.mockResolvedValue([]);
    const row = {
      id: "asset-1",
      entityType: MediaEntityType.CLIENT_CARD,
      entityId: "card-1",
      kind: MediaKind.CLIENT_CARD_PHOTO,
      storageKey: "k",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      originalFilename: "photo.jpg",
      createdAt: new Date("2026-08-05T00:00:00Z"),
    };
    create.mockResolvedValue(row);
    update.mockResolvedValue(row);
  });

  it("отказывает, когда аккаунт исчерпал квоту — строка ассета не создаётся", async () => {
    aggregate.mockResolvedValue({ _sum: { sizeBytes: MEDIA_USER_STORAGE_QUOTA_BYTES } });

    await expect(upload()).rejects.toMatchObject({
      code: "MEDIA_STORAGE_QUOTA_EXCEEDED",
      status: 409,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("считает сумму по ЖИВЫМ ассетам аккаунта", async () => {
    // удалённый ассет уже не занимает места (`deleteAssetById` чистит хранилище),
    // и держать его в сумме означало бы наказывать за уборку
    aggregate.mockResolvedValue({ _sum: { sizeBytes: 0 } });

    await upload();

    expect(aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdByUserId: "user-1", deletedAt: null },
        _sum: { sizeBytes: true },
      }),
    );
  });

  it("пропускает загрузку в пределах квоты", async () => {
    aggregate.mockResolvedValue({ _sum: { sizeBytes: 1024 } });

    await upload();

    expect(create).toHaveBeenCalledTimes(1);
  });

  it("трактует пустое хранилище как ноль, а не как отсутствие лимита", async () => {
    // Prisma отдаёт `_sum.sizeBytes === null`, когда строк нет
    aggregate.mockResolvedValue({ _sum: { sizeBytes: null } });

    await upload();

    expect(create).toHaveBeenCalledTimes(1);
  });
});
