import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";

/**
 * MEDIA-PURGE-MARK-DELETED — сценарий «хранилище недоступно в момент удаления
 * кабинета»: задача `media.purge` падает, но фото уже не отдаётся публично, а
 * ежечасная уборка хранилища видит строку и доделывает байты сама.
 *
 * До правки строка медиа удалённого кабинета оставалась ЖИВОЙ, пока purge не
 * отработает: аватар кабинета публичен по построению, поэтому
 * `/api/media/file/{id}` продолжал его отдавать, а при недоступном хранилище
 * (исчерпанные повторы → dead-letter) — бессрочно; уборка
 * (`sweepDeletedAssetStorage`) берёт только `deletedAt IS NOT NULL` и строку
 * не видела.
 *
 * Настоящие здесь: обработчик `GET /api/media/file/[id]`, `markAssetsDeletedTx`,
 * `runMediaPurge`, `sweepDeletedAssetStorage`, `deleteMediaPreviews`. Подменены
 * БД (строки в памяти, разбор `where` — ровно те формы, что пишут эти модули),
 * хранилище (карта в памяти с выключателем недоступности), сессия, ACL и
 * мониторинг.
 *
 * @probe 2026-10-30 — в `markAssetsDeletedTx` убрано `deletedAt: now` из `data`:
 *        2 красных — сценарий целиком (после «удаления» аватар отдаётся 200
 *        вместо 404) и «повторная пометка не сдвигает дату» (строка не
 *        помечена вовсе). Возвращено — 4/4 зелёный.
 */

type Row = {
  id: string;
  entityId: string;
  entityType: MediaEntityType;
  kind: MediaKind;
  storageKey: string;
  mimeType: string;
  status: MediaAssetStatus;
  deletedAt: Date | null;
  storageDeletedAt: Date | null;
  visualDescription: string | null;
  visualMeta: unknown;
  visualCategory: string | null;
};

const db = vi.hoisted(() => ({
  rows: new Map<string, Record<string, unknown>>(),
  embeddings: new Set<string>(),
}));

const storage = vi.hoisted(() => ({
  objects: new Map<string, Buffer>(),
  down: false,
}));

/** Разбор `where` в тех формах, что встречаются у этих модулей. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([field, cond]) => {
    const value = row[field];
    if (cond === null) return value === null;
    if (cond instanceof Date || typeof cond !== "object") return value === cond;
    const ops = cond as { in?: unknown[]; not?: unknown; lt?: Date };
    if (ops.in && !ops.in.includes(value)) return false;
    if ("not" in ops && ops.not === null && value === null) return false;
    if (ops.lt && !(value instanceof Date && value.getTime() < ops.lt.getTime())) return false;
    return true;
  });
}

function pick(row: Record<string, unknown>, select?: Record<string, boolean>): Record<string, unknown> {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((key) => [key, row[key]]));
}

vi.mock("@/lib/prisma", () => {
  const mediaAsset = {
    findUnique: async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      const row = db.rows.get(args.where.id);
      return row ? pick(row, args.select) : null;
    },
    findMany: async (args: { where: Record<string, unknown>; take?: number; select?: Record<string, boolean> }) =>
      [...db.rows.values()]
        .filter((row) => matches(row, args.where))
        .slice(0, args.take ?? Infinity)
        .map((row) => pick(row, args.select)),
    updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      const hit = [...db.rows.values()].filter((row) => matches(row, args.where));
      for (const row of hit) Object.assign(row, args.data);
      return { count: hit.length };
    },
    deleteMany: async (args: { where: Record<string, unknown> }) => {
      const hit = [...db.rows.values()].filter((row) => matches(row, args.where));
      for (const row of hit) db.rows.delete(row.id as string);
      return { count: hit.length };
    },
  };
  const mediaAssetEmbedding = {
    deleteMany: async (args: { where: { assetId: { in: string[] } } }) => {
      let count = 0;
      for (const id of args.where.assetId.in) if (db.embeddings.delete(id)) count += 1;
      return { count };
    },
  };
  return { prisma: { mediaAsset, mediaAssetEmbedding } };
});

vi.mock("@/lib/media/storage", async () => {
  const { StorageUnavailableError } = await import("@/lib/media/storage/unavailable");
  const unavailable = (operation: "getObject" | "deleteObject") =>
    new StorageUnavailableError(operation, { name: "TenantSuspended", $metadata: { httpStatusCode: 403 } });
  return {
    getStorageProvider: () => ({
      name: "memory",
      getObject: async (key: string, contentType: string) => {
        if (storage.down) throw unavailable("getObject");
        const bytes = storage.objects.get(key);
        return bytes ? { stream: Readable.from([bytes]), sizeBytes: bytes.length, contentType } : null;
      },
      deleteObject: async (key: string) => {
        if (storage.down) throw unavailable("deleteObject");
        storage.objects.delete(key);
      },
    }),
  };
});

vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/media/access", () => ({
  ensureCanReadMedia: async () => {
    throw Object.assign(new Error("Требуется вход в аккаунт."), { status: 401, code: "UNAUTHORIZED" });
  },
}));
vi.mock("@/lib/media/private-delivery", () => ({
  PRIVATE_MEDIA_TOKEN_QUERY_PARAM: "mt",
  verifyPrivateMediaDeliveryToken: () => false,
}));
// Аватар кабинета публичен всегда — ровно поэтому живая строка и утекала.
vi.mock("@/lib/media/service", () => ({
  isProviderMediaPubliclyVisible: async () => true,
  getMediaFile: async () => {
    throw new Error("сессионная ветка в этом сценарии не нужна");
  },
}));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: async () => undefined }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: async () => false }));
vi.mock("@/lib/logging/logger", () => ({
  logInfo: vi.fn(),
  logError: vi.fn(),
  getRequestId: () => "req-test",
}));

import { GET } from "@/app/api/media/file/[id]/route";
import { STORAGE_SWEEP_GRACE_MS, sweepDeletedAssetStorage } from "@/lib/media/cleanup";
import { mediaPreviewStorageKey, mediaPreviewStorageKeys } from "@/lib/media/preview-variants";
import { runMediaPurge } from "@/lib/media/purge";
import { markAssetsDeletedTx } from "@/lib/media/soft-delete";
import { prisma } from "@/lib/prisma";

const ASSET_ID = "cmavatar0000000000000001";
const STORAGE_KEY = "master/p1/avatar-1-uuid.jpg";
const BYTES = Buffer.from("фото лица");
const DELETED_AT = new Date("2026-10-30T09:00:00.000Z");

function fetchAvatar(query = "") {
  return GET(new Request(`https://example.test/api/media/file/${ASSET_ID}${query}`), {
    params: Promise.resolve({ id: ASSET_ID }),
  });
}

function row(): Row {
  return db.rows.get(ASSET_ID) as Row;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DELETED_AT);
  db.rows.clear();
  db.embeddings.clear();
  storage.objects.clear();
  storage.down = false;

  const asset: Row = {
    id: ASSET_ID,
    entityId: "p1",
    entityType: MediaEntityType.MASTER,
    kind: MediaKind.AVATAR,
    storageKey: STORAGE_KEY,
    mimeType: "image/jpeg",
    status: MediaAssetStatus.READY,
    deletedAt: null,
    storageDeletedAt: null,
    visualDescription: "описание",
    visualMeta: { color: "red" },
    visualCategory: "hair",
  };
  db.rows.set(ASSET_ID, asset);
  db.embeddings.add(ASSET_ID);
  storage.objects.set(STORAGE_KEY, BYTES);
  storage.objects.set(mediaPreviewStorageKey(STORAGE_KEY, 320), Buffer.from("превью"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("MEDIA-PURGE-MARK-DELETED — хранилище недоступно в момент удаления кабинета", () => {
  it("до удаления аватар кабинета отдаётся публично (исходная точка)", async () => {
    const res = await fetchAvatar();
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(BYTES);
  });

  it("с коммита удаления фото не отдаётся, задача падает, уборка доделывает байты, повтор задачи — строку", async () => {
    // 1. Транзакция удаления кабинета: снимок помечен удалённым.
    await markAssetsDeletedTx(prisma as never, [ASSET_ID], DELETED_AT);
    expect(row().deletedAt).toEqual(DELETED_AT);
    expect(row().visualDescription).toBeNull();
    expect(row().visualCategory).toBeNull();
    expect(db.embeddings.has(ASSET_ID)).toBe(false);

    // 2. С этого момента ни оригинал, ни превью публично не отдаются —
    //    ещё до того, как воркер дотронулся до хранилища.
    expect((await fetchAvatar()).status).toBe(404);
    expect((await fetchAvatar("?w=320")).status).toBe(404);

    // 3. Хранилище недоступно: задача падает (очередь повторит, затем
    //    dead-letter), строка остаётся — единственный указатель на байты.
    storage.down = true;
    await expect(
      runMediaPurge({
        assets: [{ id: ASSET_ID, storageKey: STORAGE_KEY }],
        reason: "master-cabinet-deletion",
        actorUserId: "u1",
      }),
    ).rejects.toThrow(/Media purge incomplete/);
    expect(row()).toBeDefined();
    expect(row().deletedAt).toEqual(DELETED_AT);
    expect(storage.objects.has(STORAGE_KEY)).toBe(true);
    // …и фото по-прежнему не отдаётся.
    expect((await fetchAvatar()).status).toBe(404);

    // 4. Уборка не трогает строку внутри окна ожидания.
    vi.setSystemTime(new Date(DELETED_AT.getTime() + STORAGE_SWEEP_GRACE_MS / 2));
    expect(await sweepDeletedAssetStorage()).toEqual({ cleared: 0, failed: 0, storageUnavailable: false });

    // 5. После окна уборка ВИДИТ строку; хранилище всё ещё лежит — проход
    //    останавливается без отметки.
    vi.setSystemTime(new Date(DELETED_AT.getTime() + STORAGE_SWEEP_GRACE_MS + 60_000));
    expect(await sweepDeletedAssetStorage()).toEqual({ cleared: 0, failed: 0, storageUnavailable: true });
    expect(row().storageDeletedAt).toBeNull();

    // 6. Хранилище вернулось: следующий проход удаляет оригинал и все превью
    //    и ставит отметку — независимо от того, что задача лежит в dead-letter.
    storage.down = false;
    expect(await sweepDeletedAssetStorage()).toEqual({ cleared: 1, failed: 0, storageUnavailable: false });
    expect(storage.objects.has(STORAGE_KEY)).toBe(false);
    for (const key of mediaPreviewStorageKeys(STORAGE_KEY)) expect(storage.objects.has(key)).toBe(false);
    expect(row().storageDeletedAt).toBeInstanceOf(Date);

    // 7. Повтор задачи (переотправка из dead-letter) идемпотентен: объекта уже
    //    нет — не ошибка, строка удаляется.
    await expect(
      runMediaPurge({
        assets: [{ id: ASSET_ID, storageKey: STORAGE_KEY }],
        reason: "master-cabinet-deletion",
        actorUserId: "u1",
      }),
    ).resolves.toEqual({ objectsDeleted: 1, rowsDeleted: 1, failures: 0 });
    expect(db.rows.has(ASSET_ID)).toBe(false);
  });

  it("если задача успела раньше уборки — уборке нечего делать (пути не мешают друг другу)", async () => {
    await markAssetsDeletedTx(prisma as never, [ASSET_ID], DELETED_AT);
    await runMediaPurge({
      assets: [{ id: ASSET_ID, storageKey: STORAGE_KEY }],
      reason: "master-cabinet-deletion",
      actorUserId: "u1",
    });
    expect(db.rows.has(ASSET_ID)).toBe(false);
    expect(storage.objects.size).toBe(0);

    vi.setSystemTime(new Date(DELETED_AT.getTime() + STORAGE_SWEEP_GRACE_MS + 60_000));
    expect(await sweepDeletedAssetStorage()).toEqual({ cleared: 0, failed: 0, storageUnavailable: false });
  });

  it("повторная пометка не сдвигает дату удаления (окно уборки не начинается заново)", async () => {
    await markAssetsDeletedTx(prisma as never, [ASSET_ID], DELETED_AT);
    const later = new Date(DELETED_AT.getTime() + 3_600_000);
    expect(await markAssetsDeletedTx(prisma as never, [ASSET_ID, ASSET_ID], later)).toBe(0);
    expect(row().deletedAt).toEqual(DELETED_AT);
  });
});
