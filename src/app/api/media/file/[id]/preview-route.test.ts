import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";

/**
 * MOBILE-B1 — `GET /api/media/file/{id}?w=` отдаёт превью той же ширины из
 * набора, с ТЕМ ЖЕ доступом и кэш-политикой, что оригинал в своей ветке, а без
 * `w` (или с мусорным `w`) — ровно прежний ответ.
 *
 * Настоящие здесь обработчик, `preview-variants` и sharp; подменены БД,
 * хранилище (карта в памяти), сессия и ACL.
 *
 * @probe 2026-10-03 — в публичной ветке `previewResponse(…, sharedCacheControlFor(…))`
 *        заменён на `"private, no-store"`: красный «публичный актив: превью
 *        public immutable». Возвращено — зелёный.
 * @probe 2026-10-03 — в сессионной ветке убран `ensureCanReadMedia` перед
 *        `readMediaPreview`: красный «приватный актив без сессии — 401».
 *        Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({
  asset: null as Record<string, unknown> | null,
  publiclyVisible: true,
  sessionUser: null as { id: string } | null,
  tokenValid: true,
}));

const store = vi.hoisted(() => new Map<string, Buffer>());

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: () => Promise.resolve(state.sessionUser),
}));

vi.mock("@/lib/media/access", () => ({
  ensureCanReadMedia: (user: unknown) =>
    user
      ? Promise.resolve()
      : Promise.reject(Object.assign(new Error("Требуется вход в аккаунт."), { status: 401, code: "UNAUTHORIZED" })),
}));

vi.mock("@/lib/media/private-delivery", () => ({
  PRIVATE_MEDIA_TOKEN_QUERY_PARAM: "mt",
  verifyPrivateMediaDeliveryToken: () => state.tokenValid,
}));

vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({
    name: "memory",
    getObject: async (key: string, contentType: string) => {
      const bytes = store.get(key);
      return bytes ? { stream: Readable.from([bytes]), sizeBytes: bytes.length, contentType } : null;
    },
    putObject: async (input: { key: string; bytes: Uint8Array }) => {
      store.set(input.key, Buffer.from(input.bytes));
    },
    deleteObject: async (key: string) => {
      store.delete(key);
    },
  }),
}));

vi.mock("@/lib/media/service", () => ({
  isProviderMediaPubliclyVisible: vi.fn(async () => state.publiclyVisible),
  getMediaFile: vi.fn(async () => {
    const bytes = store.get("master/p1/portfolio-1-uuid.jpg")!;
    return {
      stream: Readable.toWeb(Readable.from([bytes])) as ReadableStream,
      contentType: "image/jpeg",
      contentLength: bytes.length,
    };
  }),
}));

vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn(async () => undefined) }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: {
      findUnique: vi.fn(async () => state.asset),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));

import { SESSION_REFRESHED_REQUEST_HEADER } from "@/lib/api/cache-headers";
import { mediaPreviewStorageKey } from "@/lib/media/preview-variants";
import { GET } from "./route";

const ASSET_ID = "cmasset00000000000000001";
const STORAGE_KEY = "master/p1/portfolio-1-uuid.jpg";
let original: Buffer;

function call(query: string, headers?: Record<string, string>) {
  return GET(new Request(`https://example.test/api/media/file/${ASSET_ID}${query}`, { headers }), {
    params: Promise.resolve({ id: ASSET_ID }),
  });
}

async function widthOf(res: Response): Promise<number | undefined> {
  return (await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width;
}

beforeEach(async () => {
  store.clear();
  original = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .jpeg()
    .toBuffer();
  store.set(STORAGE_KEY, original);
  state.publiclyVisible = true;
  state.sessionUser = null;
  state.tokenValid = true;
  state.asset = {
    id: ASSET_ID,
    entityId: "p1",
    storageKey: STORAGE_KEY,
    mimeType: "image/jpeg",
    status: MediaAssetStatus.READY,
    kind: MediaKind.PORTFOLIO,
    entityType: MediaEntityType.MASTER,
    deletedAt: null,
  };
});

describe("GET /api/media/file/[id] — без `w` ничего не меняется", () => {
  it("оригинал байт в байт, его тип и public immutable", async () => {
    const res = await call("");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(original);
  });

  it.each(["?w=abc", "?w=0", "?w=-1", "?w=", "?w=12.5"])("мусорный %s — тоже оригинал, не 400", async (query) => {
    const res = await call(query);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(original);
    expect([...store.keys()]).toEqual([STORAGE_KEY]);
  });
});

describe("GET /api/media/file/[id]?w= — превью", () => {
  it("публичный актив: webp ширины из набора, public immutable, вариант сохранён", async () => {
    const res = await call("?w=300");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(await widthOf(res)).toBe(320);
    expect(store.has(mediaPreviewStorageKey(STORAGE_KEY, 320))).toBe(true);
  });

  it("повторный запрос отдаёт сохранённый вариант (оригинал больше не нужен)", async () => {
    await (await call("?w=640")).arrayBuffer();
    store.delete(STORAGE_KEY);
    const res = await call("?w=640");
    expect(res.status).toBe(200);
    expect(await widthOf(res)).toBe(640);
  });

  it("публичный актив в запросе с обновлённой сессией — private (как у оригинала)", async () => {
    const res = await call("?w=320", { [SESSION_REFRESHED_REQUEST_HEADER]: "1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("приватный актив без сессии — 401, байты не отдаются и не жмутся", async () => {
    state.publiclyVisible = false;
    const res = await call("?w=320");
    expect(res.status).toBe(401);
    expect(store.has(mediaPreviewStorageKey(STORAGE_KEY, 320))).toBe(false);
  });

  it("приватный актив с доступом — превью с private, no-store", async () => {
    state.publiclyVisible = false;
    state.sessionUser = { id: "u1" };
    const res = await call("?w=160");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await widthOf(res)).toBe(160);
  });

  it("ветка `?mt=`: превью с private, no-store; битый токен — 401", async () => {
    state.publiclyVisible = false;
    state.sessionUser = { id: "u1" };
    const res = await call("?mt=token&w=480");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await widthOf(res)).toBe(480);

    state.tokenValid = false;
    expect((await call("?mt=bad&w=480")).status).toBe(401);
  });

  it("нет байтов оригинала — 404 MEDIA_ASSET_NOT_FOUND, как без `w`", async () => {
    store.clear();
    const res = await call("?w=320");
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("MEDIA_ASSET_NOT_FOUND");
  });

  it("не-картинка игнорирует `w` и отдаётся как есть", async () => {
    state.asset = { ...state.asset!, mimeType: "application/pdf" };
    const res = await call("?w=320");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(original);
  });
});
