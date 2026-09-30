import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 29.09 доработки · 16 (RKN-AUDIT-01) — гонка индексатора: `deletedAt`
 * проверяется в начале, потом секунды идут запросы к Яндексу, и фото,
 * удалённое за это время, раньше получало эмбеддинг уже после удаления.
 * Финальная запись теперь — `updateMany({ where: { id, deletedAt: null } })`;
 * `count === 0` — фото удалили, ни эмбеддинга, ни категории работы.
 *
 * @probe 2026-09-29 — в `indexer.ts` убрана строка `if (written.count === 0) return;`:
 *        красный «удалённое во время индексации фото эмбеддинг не получает»
 *        (`$executeRaw` вызван). Возвращено — зелёный. Второй кейс — контроль,
 *        что живое фото эмбеддинг получает (иначе первый зеленел бы на
 *        индексаторе, который не пишет вообще ничего).
 */

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  portfolioUpdateMany: vi.fn(async () => ({ count: 1 })),
  executeRaw: vi.fn(async () => 1),
}));

vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/visual-search/config", () => ({ assertVisualSearchEnabled: vi.fn(async () => {}) }));
vi.mock("@/lib/visual-search/classifier", () => ({
  classifyImage: vi.fn(async () => ({ category: "nails", confidence: "high" })),
}));
vi.mock("@/lib/visual-search/category-registry", () => ({
  getStrategy: () => ({ promptVersion: "v-test", filterFields: [] }),
}));
vi.mock("@/lib/visual-search/meta-sanitize", () => ({ sanitizeVisualMeta: () => ({}) }));
vi.mock("@/lib/media/storage", () => ({
  getStorageProvider: () => ({ getObject: async () => ({ stream: [Buffer.from([1, 2, 3])] }) }),
}));
vi.mock("@/lib/visual-search/provider", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/visual-search/provider")>()),
  resizeForVision: vi.fn(async (bytes: Uint8Array) => bytes),
  describeImageWithStrategy: vi.fn(async () => ({ text_description: "маникюр", meta: {} })),
  createDocEmbedding: vi.fn(async () => new Array(256).fill(0.1)),
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
    globalCategory: { findFirst: vi.fn(async () => ({ id: "cat-1" })) },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        mediaAsset: { updateMany: mocks.updateMany },
        portfolioItem: { updateMany: mocks.portfolioUpdateMany },
        globalCategory: { update: vi.fn() },
        $executeRaw: mocks.executeRaw,
      }),
    ),
  },
}));

import { indexMediaAsset } from "@/lib/visual-search/indexer";

beforeEach(() => {
  mocks.updateMany.mockReset();
  mocks.portfolioUpdateMany.mockClear();
  mocks.executeRaw.mockClear();
});

describe("индексатор: фото удалили, пока шла индексация", () => {
  it("удалённое во время индексации фото эмбеддинг не получает", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 0 });
    await indexMediaAsset("asset-1");
    expect(mocks.updateMany.mock.calls[0][0].where).toEqual({ id: "asset-1", deletedAt: null });
    expect(mocks.executeRaw).not.toHaveBeenCalled();
    expect(mocks.portfolioUpdateMany).not.toHaveBeenCalled();
  });

  it("живое фото эмбеддинг получает (контроль)", async () => {
    mocks.updateMany.mockResolvedValueOnce({ count: 1 });
    await indexMediaAsset("asset-1");
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    expect(mocks.portfolioUpdateMany).toHaveBeenCalledTimes(1);
  });
});
