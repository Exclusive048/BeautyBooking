import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MediaAssetStatus, MediaEntityType, MediaKind } from "@prisma/client";

/**
 * CROP-PUBLIC-01 — роут выреза отдаёт ровно сохранённую область, и доступ у
 * него тот же, что у исходника.
 *
 * Настоящие здесь сам обработчик и нарезка (sharp); подменены только БД и
 * хранилище. Исходник — 1200×800 из четырёх цветных четвертей, поэтому
 * правильность выреза проверяется по цвету ПИКСЕЛЕЙ ответа.
 *
 * @probe 2026-09-23 — в роуте убрана проверка версии (`params.v !==
 *        cropVersionToken(asset)`): красный «устаревшая версия уводит
 *        редиректом» — ответ 200 вместо 307. Возвращено — зелёный.
 */

const YELLOW = { r: 255, g: 225, b: 25 };

const state = vi.hoisted(() => ({
  asset: null as Record<string, unknown> | null,
  publiclyVisible: true,
  sessionUser: null as { id: string } | null,
  source: Buffer.alloc(0) as Buffer,
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: () => Promise.resolve(state.sessionUser),
}));

vi.mock("@/lib/media/access", () => ({
  ensureCanReadMedia: (user: unknown) =>
    user
      ? Promise.resolve()
      : Promise.reject(Object.assign(new Error("Требуется вход в аккаунт."), { status: 401, code: "UNAUTHORIZED" })),
}));

vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({
    getObject: () =>
      Promise.resolve({ stream: Readable.from([state.source]), contentType: "image/png", sizeBytes: state.source.length }),
  }),
}));

vi.mock("@/lib/media/service", () => ({
  isProviderMediaPubliclyVisible: vi.fn(async () => state.publiclyVisible),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { mediaAsset: { findUnique: vi.fn(async () => state.asset) } },
}));

import { SESSION_REFRESHED_REQUEST_HEADER } from "@/lib/api/cache-headers";
import { GET } from "./route";

async function quadrants(): Promise<Buffer> {
  const tile = (background: { r: number; g: number; b: number }) =>
    sharp({ create: { width: 600, height: 400, channels: 3, background } }).png().toBuffer();
  const [tl, tr, bl, br] = await Promise.all([
    tile({ r: 230, g: 25, b: 75 }),
    tile({ r: 60, g: 180, b: 75 }),
    tile({ r: 67, g: 99, b: 216 }),
    tile(YELLOW),
  ]);
  return sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([
      { input: tl, left: 0, top: 0 },
      { input: tr, left: 600, top: 0 },
      { input: bl, left: 0, top: 400 },
      { input: br, left: 600, top: 400 },
    ])
    .png()
    .toBuffer();
}

// Квадрат 300×300 px в правой нижней четверти.
const CROP = { cropX: 700 / 1200, cropY: 450 / 800, cropWidth: 300 / 1200, cropHeight: 300 / 800 };
const TOKEN = "5833-5625-2500-3750";

function call(v: string, headers?: Record<string, string>) {
  return GET(new Request(`https://example.test/api/media/file/asset1/crop/${v}`, { headers }), {
    params: Promise.resolve({ id: "cmasset00000000000000001", v }),
  });
}

beforeEach(async () => {
  state.source = await quadrants();
  state.publiclyVisible = true;
  state.sessionUser = null;
  state.asset = {
    id: "cmasset00000000000000001",
    entityId: "prov1",
    storageKey: "k",
    mimeType: "image/png",
    status: MediaAssetStatus.READY,
    kind: MediaKind.AVATAR,
    entityType: MediaEntityType.MASTER,
    deletedAt: null,
    ...CROP,
  };
});

describe("GET /api/media/file/[id]/crop/[v]", () => {
  it("отдаёт вырез сохранённой области: квадрат, жёлтый, public immutable", async () => {
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");

    const out = Buffer.from(await res.arrayBuffer());
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(info.height);
    const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    expect(Math.abs(data[i]! - YELLOW.r)).toBeLessThan(12);
    expect(Math.abs(data[i + 1]! - YELLOW.g)).toBeLessThan(12);
    expect(Math.abs(data[i + 2]! - YELLOW.b)).toBeLessThan(12);
  });

  it("устаревшая версия уводит редиректом на актуальную ссылку", async () => {
    const res = await call("1-2-3-4");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(
      `/api/media/file/cmasset00000000000000001/crop/${TOKEN}`,
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("без области — редирект на исходник", async () => {
    state.asset = { ...state.asset!, cropX: null, cropY: null, cropWidth: null, cropHeight: null };
    const res = await call(TOKEN);
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/api/media/file/cmasset00000000000000001");
  });

  it("непубличный актив без сессии — отказ, байты не отдаются", async () => {
    state.publiclyVisible = false;
    const res = await call(TOKEN);
    expect(res.status).toBe(401);
  });

  /**
   * PUBLIC-CACHE-SET-COOKIE — прокси ротировал сессию в этом запросе, значит к
   * ответу приложится `Set-Cookie`: разделяемый кэш такому ответу запрещён.
   *
   * @probe 2026-09-23 — в роуте `sharedCacheControlFor(req, …)` заменён
   *        литералом `public, …`: красный этот кейс. Возвращено — зелёный.
   */
  it("публичный вырез в запросе с обновлённой сессией — private, без разделяемого кэша", async () => {
    const res = await call(TOKEN, { [SESSION_REFRESHED_REQUEST_HEADER]: "1" });
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  it("непубличный актив с доступом — вырез с private-кэшем", async () => {
    state.publiclyVisible = false;
    state.sessionUser = { id: "u1" };
    const res = await call(TOKEN);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});
