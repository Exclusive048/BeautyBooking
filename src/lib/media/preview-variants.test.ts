import { Readable } from "node:stream";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — превью по ширине (`?w=`) для списков приложения.
 *
 * Настоящие здесь sharp и вся логика модуля; хранилище — карта в памяти, БД —
 * одна строка актива для перепроверки после записи варианта.
 *
 * @probe 2026-10-03 — в `parseMediaPreviewWidth` округление вверх заменено на
 *        «как прислали» (`return requested`): красные пять кейсов «округляет
 *        вверх» (ширины вне набора). Возвращено — зелёный.
 * @probe 2026-10-03 — из `generatePreview` убран `dropPreviewIfAssetGone`:
 *        красный «актив удалили, пока жали». Возвращено — зелёный.
 */

const store = vi.hoisted(() => new Map<string, { bytes: Buffer; contentType: string }>());
const storageSpies = vi.hoisted(() => ({
  getObject: vi.fn(),
  putObject: vi.fn(),
  deleteObject: vi.fn(),
}));
const assetRow = vi.hoisted(() => ({ value: { deletedAt: null as Date | null } as { deletedAt: Date | null } | null }));

const fakeStorage = vi.hoisted(() => ({
  name: "memory",
  async getObject(key: string, contentType: string) {
    storageSpies.getObject(key);
    const hit = store.get(key);
    if (!hit) return null;
    return { stream: Readable.from([hit.bytes]), sizeBytes: hit.bytes.length, contentType };
  },
  async putObject(input: { key: string; bytes: Uint8Array; contentType: string }) {
    storageSpies.putObject(input.key);
    store.set(input.key, { bytes: Buffer.from(input.bytes), contentType: input.contentType });
  },
  async deleteObject(key: string) {
    storageSpies.deleteObject(key);
    store.delete(key);
  },
}));

vi.mock("@/lib/media/storage", () => ({ getStorageProvider: () => fakeStorage }));
vi.mock("@/lib/prisma", () => ({
  prisma: { mediaAsset: { findUnique: vi.fn(async () => assetRow.value) } },
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import {
  MEDIA_PREVIEW_WIDTHS,
  deleteMediaPreviews,
  isPreviewableMimeType,
  mediaPreviewStorageKey,
  mediaPreviewStorageKeys,
  parseMediaPreviewWidth,
  readMediaPreview,
  renderMediaPreview,
} from "@/lib/media/preview-variants";

const ASSET = { id: "asset1", storageKey: "master/p1/portfolio-1-uuid.jpg", mimeType: "image/jpeg" };

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } })
    .jpeg()
    .toBuffer();
}

async function bodyBytes(body: ReadableStream | Uint8Array): Promise<Buffer> {
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(await new Response(body).arrayBuffer());
}

beforeEach(() => {
  store.clear();
  storageSpies.getObject.mockReset();
  storageSpies.putObject.mockReset();
  storageSpies.deleteObject.mockReset();
  assetRow.value = { deletedAt: null };
});

describe("parseMediaPreviewWidth — фиксированный набор ширин", () => {
  it("набор зафиксирован: 160…1280, по возрастанию", () => {
    expect([...MEDIA_PREVIEW_WIDTHS]).toEqual([160, 320, 480, 640, 960, 1280]);
  });

  it.each([
    ["1", 160],
    ["160", 160],
    ["161", 320],
    ["300", 320],
    ["480", 480],
    ["500", 640],
    ["1000", 1280],
    [" 640 ", 640],
  ])("округляет вверх до ширины набора: w=%s → %d", (raw, expected) => {
    expect(parseMediaPreviewWidth(raw)).toBe(expected);
  });

  it("выше потолка — 1280 (оригинал — без `w`)", () => {
    expect(parseMediaPreviewWidth("1281")).toBe(1280);
    expect(parseMediaPreviewWidth("999999")).toBe(1280);
  });

  it.each([null, undefined, "", "0", "-5", "abc", "12.5", "1e3", "0x100", "1234567", "320px"])(
    "мусор (%s) — null, то есть оригинал, а не 400",
    (raw) => {
      expect(parseMediaPreviewWidth(raw)).toBeNull();
    },
  );

  it("превью — только для картинок", () => {
    expect(isPreviewableMimeType("image/jpeg")).toBe(true);
    expect(isPreviewableMimeType("image/png")).toBe(true);
    expect(isPreviewableMimeType("image/webp")).toBe(true);
    expect(isPreviewableMimeType("application/pdf")).toBe(false);
  });
});

describe("ключ варианта", () => {
  it("рядом с оригиналом и наследует его случайную часть", () => {
    expect(mediaPreviewStorageKey(ASSET.storageKey, 320)).toBe(`${ASSET.storageKey}.w320.webp`);
  });

  it("набор ключей — по одному на ширину", () => {
    expect(mediaPreviewStorageKeys("k")).toEqual(MEDIA_PREVIEW_WIDTHS.map((w) => `k.w${w}.webp`));
  });
});

describe("renderMediaPreview", () => {
  it("уменьшает до ширины с сохранением пропорций, в webp", async () => {
    const out = await renderMediaPreview(await jpeg(2000, 1000), 320);
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(160);
  });

  it("не растягивает мелкий исходник", async () => {
    const out = await renderMediaPreview(await jpeg(200, 300), 1280);
    const meta = await sharp(out).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(300);
  });
});

describe("readMediaPreview — кэш вариантов в хранилище", () => {
  it("промах: собирает, сохраняет по ключу и отдаёт webp", async () => {
    store.set(ASSET.storageKey, { bytes: await jpeg(1600, 1200), contentType: "image/jpeg" });

    const result = await readMediaPreview(ASSET, 480);
    expect(result).not.toBeNull();
    expect(result!.contentType).toBe("image/webp");
    const bytes = await bodyBytes(result!.body);
    expect(result!.sizeBytes).toBe(bytes.length);
    expect((await sharp(bytes).metadata()).width).toBe(480);
    expect(store.has(mediaPreviewStorageKey(ASSET.storageKey, 480))).toBe(true);
  });

  it("попадание: отдаёт сохранённый вариант, оригинал не читает", async () => {
    const cached = await renderMediaPreview(await jpeg(800, 800), 160);
    store.set(mediaPreviewStorageKey(ASSET.storageKey, 160), { bytes: cached, contentType: "image/webp" });

    const result = await readMediaPreview(ASSET, 160);
    expect(await bodyBytes(result!.body)).toEqual(cached);
    expect(storageSpies.getObject).not.toHaveBeenCalledWith(ASSET.storageKey);
    expect(storageSpies.putObject).not.toHaveBeenCalled();
  });

  it("нет оригинала — null (роут отвечает 404 как для оригинала)", async () => {
    expect(await readMediaPreview(ASSET, 320)).toBeNull();
    expect(storageSpies.putObject).not.toHaveBeenCalled();
  });

  it("неразбираемый исходник — отдаётся как есть, ничего не сохраняется", async () => {
    const junk = Buffer.from("not an image");
    store.set(ASSET.storageKey, { bytes: junk, contentType: "image/jpeg" });

    const result = await readMediaPreview(ASSET, 320);
    expect(result!.contentType).toBe("image/jpeg");
    expect(await bodyBytes(result!.body)).toEqual(junk);
    expect(storageSpies.putObject).not.toHaveBeenCalled();
  });

  it("одновременные запросы одного варианта жмут оригинал один раз", async () => {
    store.set(ASSET.storageKey, { bytes: await jpeg(1600, 1200), contentType: "image/jpeg" });

    const [a, b, c] = await Promise.all([
      readMediaPreview(ASSET, 640),
      readMediaPreview(ASSET, 640),
      readMediaPreview(ASSET, 640),
    ]);
    expect(storageSpies.putObject).toHaveBeenCalledTimes(1);
    for (const result of [a, b, c]) {
      expect((await sharp(await bodyBytes(result!.body)).metadata()).width).toBe(640);
    }
  });

  it("актив удалили, пока жали, — записанный вариант тут же удаляется", async () => {
    store.set(ASSET.storageKey, { bytes: await jpeg(1600, 1200), contentType: "image/jpeg" });
    assetRow.value = { deletedAt: new Date() };

    await readMediaPreview(ASSET, 320);
    expect(store.has(mediaPreviewStorageKey(ASSET.storageKey, 320))).toBe(false);
    expect(storageSpies.deleteObject).toHaveBeenCalledWith(mediaPreviewStorageKey(ASSET.storageKey, 320));
  });

  it("строки нет вовсе (purge) — тоже удаляется", async () => {
    store.set(ASSET.storageKey, { bytes: await jpeg(1600, 1200), contentType: "image/jpeg" });
    assetRow.value = null;

    await readMediaPreview(ASSET, 320);
    expect(store.has(mediaPreviewStorageKey(ASSET.storageKey, 320))).toBe(false);
  });
});

describe("deleteMediaPreviews", () => {
  it("удаляет весь набор ключей, даже несозданных", async () => {
    await deleteMediaPreviews(fakeStorage, ASSET.storageKey);
    expect(storageSpies.deleteObject.mock.calls.map(([key]) => key)).toEqual(
      mediaPreviewStorageKeys(ASSET.storageKey),
    );
  });

  it("сбой любого ключа — бросает, но остальные всё равно удаляются", async () => {
    const failing = mediaPreviewStorageKey(ASSET.storageKey, 480);
    const storage = {
      ...fakeStorage,
      deleteObject: vi.fn(async (key: string) => {
        if (key === failing) throw new Error("s3 down");
      }),
    };
    await expect(deleteMediaPreviews(storage, ASSET.storageKey)).rejects.toThrow("s3 down");
    expect(storage.deleteObject).toHaveBeenCalledTimes(MEDIA_PREVIEW_WIDTHS.length);
  });
});
