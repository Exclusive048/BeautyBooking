import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VISUAL-SEARCH-TRANSIENT-01 — временный отказ провайдера не делает фото
 * «нераспознанным» навсегда.
 *
 * Дефект: 429 / обрыв сети / 5xx у Яндекса приходили в индексатор тем же `null`,
 * что и «на фото не бьюти-услуга», и фото помечалось `visualIndexed = true` без
 * категории — индексатор его больше не брал, а ретрай очереди в воркере был
 * недостижим (индексатор глотал все ошибки).
 *
 * @probe 2026-09-22 — в `indexer.ts` убрана строка
 * `if (error instanceof VisualProviderUnavailableError) throw error;`: красным
 * стал первый кейс (`promise resolved "undefined" instead of rejecting`).
 * Возвращена — зелёный. Второй кейс — контроль, что пометка «нераспознано» для
 * настоящего `none` по-прежнему пишется (иначе первый кейс зеленел бы и на
 * индексаторе, который не пишет вообще ничего).
 */

const mocks = vi.hoisted(() => ({
  classifyImage: vi.fn(),
  transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({ mediaAsset: { update: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })) }, $executeRaw: vi.fn() })
  ),
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/visual-search/config", () => ({ assertVisualSearchEnabled: vi.fn(async () => {}) }));
vi.mock("@/lib/visual-search/classifier", () => ({ classifyImage: mocks.classifyImage }));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({
    getObject: async () => ({ stream: [Buffer.from([1, 2, 3])] }),
  }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: {
      findUnique: vi.fn(async () => ({
        id: "asset-1",
        kind: "PORTFOLIO",
        mimeType: "image/jpeg",
        storageKey: "k",
        visualIndexed: false,
        deletedAt: null,
      })),
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/visual-search/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/visual-search/provider")>()),
  resizeForVision: vi.fn(async (bytes: Uint8Array) => bytes),
}));

import { indexMediaAsset, isVisualSearchRetryableError } from "@/lib/visual-search/indexer";
import { VisualProviderUnavailableError } from "@/lib/visual-search/provider";

beforeEach(() => {
  mocks.classifyImage.mockReset();
  mocks.transaction.mockClear();
});

describe("VISUAL-SEARCH-TRANSIENT-01 · индексатор", () => {
  it("отказ провайдера уходит в воркер на ретрай и фото не помечается", async () => {
    mocks.classifyImage.mockRejectedValueOnce(
      new VisualProviderUnavailableError("vision", { status: 429 })
    );

    const error = await indexMediaAsset("asset-1").then(
      () => undefined,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(VisualProviderUnavailableError);
    expect(isVisualSearchRetryableError(error)).toBe(true);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("настоящее «не бьюти-фото» по-прежнему помечается нераспознанным", async () => {
    mocks.classifyImage.mockResolvedValueOnce({ category: "none", confidence: "high" });

    await expect(indexMediaAsset("asset-1")).resolves.toBeUndefined();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
