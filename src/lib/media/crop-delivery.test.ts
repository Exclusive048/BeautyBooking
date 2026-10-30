import { Readable } from "node:stream";
import sharp from "sharp";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaKind } from "@prisma/client";

/**
 * MEDIA-RENDER-DEDUP — вырез `crop/[v]` режется один раз на одинаковые
 * одновременные запросы, а рендеры выреза и превью `?w=` делят один предел
 * sharp на процесс.
 *
 * Настоящие здесь `readCroppedMedia`, `readMediaPreview`, общий предел и sharp;
 * подменены хранилище (карта в памяти со счётчиком чтений) и БД. Нарезка
 * обёрнута шпионом поверх настоящей — им считаются рендеры и их параллельность.
 *
 * @probe 2026-10-30 — в `readCroppedMedia` убрана запись в `inflightCrops`
 *        (каждый вызов зовёт `renderCrop` сам): красный «N одинаковых
 *        одновременных запросов — один рендер» (5 чтений и 5 рендеров вместо 1).
 *        Возвращено — зелёный.
 * @probe 2026-10-30 — в `renderCrop` убрана обёртка `withMediaRenderSlot`:
 *        красные «разные вырезы одновременно — не больше предела» (пик 6) и
 *        «вырез и превью ждут один и тот же предел» (вырез стартовал при
 *        занятых слотах). Возвращено — зелёный.
 * @probe 2026-10-30 — в `generatePreview` (`preview-variants.ts`) рендер вызван
 *        без `withMediaRenderSlot`: красный «вырез и превью ждут один и тот же
 *        предел» (в очереди 1 вместо 2, превью записано при занятых слотах).
 *        Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({
  store: new Map<string, Buffer>(),
  getObject: vi.fn(),
  failNextGet: false,
}));

const renders = vi.hoisted(() => ({ active: 0, peak: 0 }));

vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({
    name: "memory",
    getObject: state.getObject,
    putObject: async (input: { key: string; bytes: Uint8Array }) => {
      state.store.set(input.key, Buffer.from(input.bytes));
    },
    deleteObject: async (key: string) => {
      state.store.delete(key);
    },
  }),
}));

vi.mock("@/lib/media/crop-render", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/media/crop-render")>();
  return {
    ...actual,
    renderCroppedImage: vi.fn(async (...args: Parameters<typeof actual.renderCroppedImage>) => {
      renders.active += 1;
      renders.peak = Math.max(renders.peak, renders.active);
      try {
        return await actual.renderCroppedImage(...args);
      } finally {
        renders.active -= 1;
      }
    }),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: { mediaAsset: { findUnique: vi.fn(async () => ({ deletedAt: null })) } },
}));

vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { readCroppedMedia } from "@/lib/media/crop-delivery";
import { renderCroppedImage } from "@/lib/media/crop-render";
import { mediaPreviewStorageKey, readMediaPreview } from "@/lib/media/preview-variants";
import { MEDIA_RENDER_CONCURRENCY, mediaRenderStats, withMediaRenderSlot } from "@/lib/media/render-limit";

const AREA = { x: 0.25, y: 0.25, width: 0.5, height: 0.5 };
let source: Buffer;

function asset(id: string) {
  return { id, storageKey: `master/p1/${id}.png`, mimeType: "image/png", kind: MediaKind.PORTFOLIO };
}

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, promise };
}

beforeAll(async () => {
  source = await sharp({ create: { width: 800, height: 600, channels: 3, background: { r: 200, g: 40, b: 90 } } })
    .png()
    .toBuffer();
});

beforeEach(() => {
  state.store.clear();
  state.failNextGet = false;
  renders.active = 0;
  renders.peak = 0;
  vi.mocked(renderCroppedImage).mockClear();
  state.getObject.mockReset();
  state.getObject.mockImplementation(async (key: string, contentType: string) => {
    if (state.failNextGet) {
      state.failNextGet = false;
      throw new Error("storage glitch");
    }
    const bytes = state.store.get(key);
    return bytes ? { stream: Readable.from([bytes]), sizeBytes: bytes.length, contentType } : null;
  });
});

afterEach(() => {
  // Предел общий на процесс: тест не имеет права оставить занятый слот.
  expect(mediaRenderStats()).toEqual({ active: 0, waiting: 0 });
});

describe("readCroppedMedia — дедупликация одинаковых запросов", () => {
  it("N одинаковых одновременных запросов — одно чтение исходника и один рендер", async () => {
    const a = asset("a1");
    state.store.set(a.storageKey, source);

    const results = await Promise.all(Array.from({ length: 5 }, () => readCroppedMedia(a, AREA, "v1", 320)));

    expect(state.getObject).toHaveBeenCalledTimes(1);
    expect(renderCroppedImage).toHaveBeenCalledTimes(1);
    for (const result of results) expect(result).toBe(results[0]);
    expect((await sharp(results[0]!).metadata()).format).toBe("webp");
  });

  it("другая ширина или версия области — отдельный рендер", async () => {
    const a = asset("a1");
    state.store.set(a.storageKey, source);

    await Promise.all([
      readCroppedMedia(a, AREA, "v1", 320),
      readCroppedMedia(a, AREA, "v1", null),
      readCroppedMedia(a, AREA, "v2", 320),
      readCroppedMedia(a, AREA, "v1", 320),
    ]);

    expect(renderCroppedImage).toHaveBeenCalledTimes(3);
  });

  it("это не кэш: завершённый рендер ключ освобождает, следующий запрос режет заново", async () => {
    const a = asset("a1");
    state.store.set(a.storageKey, source);

    await readCroppedMedia(a, AREA, "v1", 320);
    await readCroppedMedia(a, AREA, "v1", 320);

    expect(renderCroppedImage).toHaveBeenCalledTimes(2);
  });

  it("сбой достаётся всем ждавшим и освобождает ключ", async () => {
    const a = asset("a1");
    state.store.set(a.storageKey, source);
    state.failNextGet = true;

    const failed = await Promise.allSettled(Array.from({ length: 3 }, () => readCroppedMedia(a, AREA, "v1", 320)));
    expect(failed.every((result) => result.status === "rejected")).toBe(true);
    expect(state.getObject).toHaveBeenCalledTimes(1);

    await expect(readCroppedMedia(a, AREA, "v1", 320)).resolves.toBeInstanceOf(Buffer);
  });

  it("исходника нет в хранилище — null без рендера", async () => {
    await expect(readCroppedMedia(asset("missing"), AREA, "v1", null)).resolves.toBeNull();
    expect(renderCroppedImage).not.toHaveBeenCalled();
  });
});

describe("общий предел рендеров sharp", () => {
  it("разные вырезы одновременно — не больше предела", async () => {
    const assets = Array.from({ length: 6 }, (_, i) => asset(`a${i}`));
    for (const a of assets) state.store.set(a.storageKey, source);

    await Promise.all(assets.map((a) => readCroppedMedia(a, AREA, "v1", null)));

    expect(renderCroppedImage).toHaveBeenCalledTimes(6);
    expect(renders.peak).toBeLessThanOrEqual(MEDIA_RENDER_CONCURRENCY);
    expect(renders.peak).toBeGreaterThan(0);
  });

  it("вырез и превью ждут один и тот же предел", async () => {
    const crop = asset("crop1");
    const preview = asset("prev1");
    state.store.set(crop.storageKey, source);
    state.store.set(preview.storageKey, source);

    // Все слоты заняты чужими рендерами.
    const holders = Array.from({ length: MEDIA_RENDER_CONCURRENCY }, gate);
    const held = holders.map((g) => withMediaRenderSlot(() => g.promise));

    const cropRead = readCroppedMedia(crop, AREA, "v1", 320);
    const previewRead = readMediaPreview(preview, 320);

    // Оба дочитали исходник и стоят в ОДНОЙ очереди; ни один рендер не начат.
    await vi.waitFor(() => expect(mediaRenderStats().waiting).toBe(2));
    expect(renderCroppedImage).not.toHaveBeenCalled();
    expect(state.store.has(mediaPreviewStorageKey(preview.storageKey, 320))).toBe(false);

    for (const g of holders) g.open();
    await Promise.all(held);
    const [cropped, previewed] = await Promise.all([cropRead, previewRead]);

    expect(cropped).toBeInstanceOf(Buffer);
    expect(previewed?.contentType).toBe("image/webp");
    expect(renderCroppedImage).toHaveBeenCalledTimes(1);
    expect(state.store.has(mediaPreviewStorageKey(preview.storageKey, 320))).toBe(true);
  });
});
