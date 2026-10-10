import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MEDIA-STORAGE-ORPHAN-SWEEP — байты удалённого фото не остаются в хранилище
 * навсегда, если хранилище было недоступно в момент удаления.
 *
 * `deleteAssetById` удаляет объект best-effort и ставит `storageDeletedAt`
 * только при успехе (`delete-asset.test.ts`); здесь — ежечасная уборка
 * воркера, которая повторяет удаление у строк без отметки. Проверяется
 * поведение на подменённых Prisma и хранилище: что выбирается, что удаляется,
 * что помечается и как проход ведёт себя при недоступном хранилище.
 *
 * @probe 2026-10-10:
 *   · в `sweepDeletedAssetStorage` снята ветка `isStorageUnavailableError`
 *     (недоступность идёт общим `failed += 1`) — 3 красных: «проход
 *     останавливается на первом отказе» (deleteObject позван 3 раза вместо 1),
 *     «молчит в logError» (запись об ошибке на каждый проход простоя),
 *     «недоступность посреди пачки»;
 *   · проверка `liveKeys` выключена — 1 красный «ключ живой строки не
 *     удаляется» (deleteObject позван с общим ключом);
 *   · отметка ставится до `deleteMediaPreviews` (`clearedIds.push` поднят
 *     выше удаления превью) — 1 красный «превью не удалились — без отметки»;
 *   · `sweepDeletedAssetStorage()` перенесён из `runMediaCleanupJob` в
 *     `runMediaCleanup` — 2 красных: «админская уборка хранилище не метёт» и
 *     «сбой уборки хранилища задачу воркера не роняет» (сбой ушёл без лога).
 *   Восстановлено, 12/12 зелёно.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn<(args: unknown) => Promise<{ count: number }>>(async () => ({ count: 0 })),
  embeddingDeleteMany: vi.fn(async () => ({ count: 0 })),
  deleteObject: vi.fn(),
  deleteMediaPreviews: vi.fn(),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo: mocks.logInfo, logError: mocks.logError }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn(async () => false) }));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({ name: "test", deleteObject: mocks.deleteObject }),
}));
vi.mock("@/lib/media/preview-variants", () => ({ deleteMediaPreviews: mocks.deleteMediaPreviews }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { findMany: mocks.findMany, updateMany: mocks.updateMany },
    mediaAssetEmbedding: { deleteMany: mocks.embeddingDeleteMany },
    $transaction: async (ops: Array<Promise<unknown>>) => Promise.all(ops),
  },
}));

import {
  runMediaCleanup,
  runMediaCleanupJob,
  STORAGE_SWEEP_BATCH,
  STORAGE_SWEEP_GRACE_MS,
  sweepDeletedAssetStorage,
} from "@/lib/media/cleanup";
import { StorageUnavailableError } from "@/lib/media/storage/unavailable";

type FindManyArgs = { where: Record<string, unknown>; take?: number; orderBy?: unknown };

const NOW = new Date("2026-10-10T12:00:00.000Z");

/** Ответы двух запросов прохода: строки-кандидаты и ключи живых строк. */
function primeSweep(rows: Array<{ id: string; storageKey: string }>, liveKeys: string[] = []): void {
  mocks.findMany.mockImplementation(async (args: FindManyArgs) => {
    if ("storageDeletedAt" in args.where) return rows;
    if ("storageKey" in args.where) return liveKeys.map((storageKey) => ({ storageKey }));
    return [];
  });
}

function markedIds(): string[] {
  const call = mocks.updateMany.mock.calls.find(([args]) => "storageDeletedAt" in (args as { data: object }).data);
  if (!call) return [];
  return (call[0] as { where: { id: { in: string[] } } }).where.id.in.slice();
}

const tenantSuspended = () =>
  new StorageUnavailableError("deleteObject", {
    name: "TenantSuspended",
    $metadata: { httpStatusCode: 403 },
  });

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.findMany.mockReset();
  mocks.updateMany.mockClear();
  mocks.embeddingDeleteMany.mockClear();
  mocks.deleteObject.mockReset();
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.deleteMediaPreviews.mockReset();
  mocks.deleteMediaPreviews.mockResolvedValue(undefined);
  mocks.logError.mockReset();
  mocks.logInfo.mockReset();
});

describe("sweepDeletedAssetStorage — что выбирается", () => {
  it("только мягко удалённые строки без отметки, старше паузы, старые первыми, пачкой", async () => {
    primeSweep([]);
    await sweepDeletedAssetStorage();
    const args = mocks.findMany.mock.calls[0]![0] as FindManyArgs;
    expect(args.where.storageDeletedAt).toBeNull();
    expect(args.where.deletedAt).toEqual({
      not: null,
      lt: new Date(NOW.getTime() - STORAGE_SWEEP_GRACE_MS),
    });
    expect(args.orderBy).toEqual({ deletedAt: "asc" });
    expect(args.take).toBe(STORAGE_SWEEP_BATCH);
  });

  it("нечего убирать — ни хранилища, ни записи, ни лога", async () => {
    primeSweep([]);
    await expect(sweepDeletedAssetStorage()).resolves.toEqual({
      cleared: 0,
      failed: 0,
      storageUnavailable: false,
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
  });
});

describe("sweepDeletedAssetStorage — удаление и отметка", () => {
  it("удаляет оригинал и превью и помечает строки", async () => {
    primeSweep([
      { id: "a1", storageKey: "k/1.jpg" },
      { id: "a2", storageKey: "k/2.jpg" },
    ]);

    const result = await sweepDeletedAssetStorage();

    expect(result).toEqual({ cleared: 2, failed: 0, storageUnavailable: false });
    expect(mocks.deleteObject.mock.calls.map(([key]) => key)).toEqual(["k/1.jpg", "k/2.jpg"]);
    expect(mocks.deleteMediaPreviews.mock.calls.map(([, key]) => key)).toEqual(["k/1.jpg", "k/2.jpg"]);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2"] }, storageDeletedAt: null },
      data: { storageDeletedAt: expect.any(Date) },
    });
  });

  it("ключ живой строки не удаляется, но удалённая строка помечается", async () => {
    primeSweep(
      [
        { id: "a1", storageKey: "k/shared.jpg" },
        { id: "a2", storageKey: "k/2.jpg" },
      ],
      ["k/shared.jpg"],
    );

    await sweepDeletedAssetStorage();

    expect(mocks.deleteObject.mock.calls.map(([key]) => key)).toEqual(["k/2.jpg"]);
    expect(markedIds()).toEqual(["a1", "a2"]);
  });

  it("превью не удалились — без отметки, следующий проход повторит", async () => {
    primeSweep([
      { id: "a1", storageKey: "k/1.jpg" },
      { id: "a2", storageKey: "k/2.jpg" },
    ]);
    mocks.deleteMediaPreviews.mockImplementation(async (_storage: unknown, key: string) => {
      if (key === "k/1.jpg") throw new Error("AccessDenied");
    });

    const result = await sweepDeletedAssetStorage();

    expect(result).toMatchObject({ cleared: 1, failed: 1 });
    expect(markedIds()).toEqual(["a2"]);
  });
});

describe("sweepDeletedAssetStorage — отказы хранилища", () => {
  it("хранилище недоступно — проход останавливается на первом отказе, отметок нет", async () => {
    primeSweep([
      { id: "a1", storageKey: "k/1.jpg" },
      { id: "a2", storageKey: "k/2.jpg" },
      { id: "a3", storageKey: "k/3.jpg" },
    ]);
    mocks.deleteObject.mockRejectedValue(tenantSuspended());

    const result = await sweepDeletedAssetStorage();

    expect(result).toEqual({ cleared: 0, failed: 0, storageUnavailable: true });
    expect(mocks.deleteObject).toHaveBeenCalledTimes(1);
    expect(markedIds()).toEqual([]);
  });

  it("недоступность молчит в logError: алерт уже ушёл из адаптера с паузой", async () => {
    primeSweep([{ id: "a1", storageKey: "k/1.jpg" }]);
    mocks.deleteObject.mockRejectedValue(tenantSuspended());

    await sweepDeletedAssetStorage();

    expect(mocks.logError).not.toHaveBeenCalled();
  });

  it("недоступность посреди пачки — уже убранные помечаются", async () => {
    primeSweep([
      { id: "a1", storageKey: "k/1.jpg" },
      { id: "a2", storageKey: "k/2.jpg" },
    ]);
    mocks.deleteObject.mockResolvedValueOnce(undefined).mockRejectedValue(tenantSuspended());

    const result = await sweepDeletedAssetStorage();

    expect(result).toEqual({ cleared: 1, failed: 0, storageUnavailable: true });
    expect(markedIds()).toEqual(["a1"]);
  });

  it("иной отказ — объект пропускается, проход идёт дальше, одна запись logError", async () => {
    primeSweep([
      { id: "a1", storageKey: "k/1.jpg" },
      { id: "a2", storageKey: "k/2.jpg" },
      { id: "a3", storageKey: "k/3.jpg" },
    ]);
    mocks.deleteObject.mockImplementation(async (key: string) => {
      if (key !== "k/2.jpg") throw new Error("SignatureDoesNotMatch");
    });

    const result = await sweepDeletedAssetStorage();

    expect(result).toEqual({ cleared: 1, failed: 2, storageUnavailable: false });
    expect(markedIds()).toEqual(["a2"]);
    expect(mocks.logError).toHaveBeenCalledTimes(1);
    expect(mocks.logError).toHaveBeenCalledWith(
      "Media storage sweep: objects of deleted assets not removed",
      expect.objectContaining({ failed: 2, cleared: 1, firstError: "SignatureDoesNotMatch" }),
    );
  });
});

describe("где живёт уборка хранилища", () => {
  const sweepQueried = () =>
    mocks.findMany.mock.calls.some(([args]) => "storageDeletedAt" in (args as FindManyArgs).where);

  it("ежечасная задача воркера метёт хранилище", async () => {
    primeSweep([]);
    await runMediaCleanupJob();
    expect(sweepQueried()).toBe(true);
  });

  it("админская уборка (`runMediaCleanup`, синхронный ответ кнопки) хранилище не метёт", async () => {
    primeSweep([]);
    await runMediaCleanup();
    expect(sweepQueried()).toBe(false);
  });

  it("сбой уборки хранилища задачу воркера не роняет", async () => {
    mocks.findMany.mockImplementation(async (args: FindManyArgs) => {
      if ("storageDeletedAt" in args.where) throw new Error("db down");
      return [];
    });

    await expect(runMediaCleanupJob()).resolves.toBeUndefined();
    expect(mocks.logError).toHaveBeenCalledWith(
      "Media storage sweep failed",
      expect.objectContaining({ error: "db down" }),
    );
  });
});
