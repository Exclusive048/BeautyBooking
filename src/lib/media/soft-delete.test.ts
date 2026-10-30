import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { markAssetsDeletedTx } from "@/lib/media/soft-delete";

/**
 * MEDIA-PURGE-MARK-DELETED — форма запросов пакетной пометки. Поведение на
 * строках (что перестаёт отдаваться и кто доделывает байты) — в
 * `purge-mark-deleted.test.ts`; здесь — что пишется и чего не пишется.
 *
 * @probe 2026-10-30 — снят ранний выход на пустом списке: красный «пустой
 *        снимок — ни одного запроса» (updateMany позван с `in: []`).
 *        Возвращено — зелёный.
 */

function fakeTx() {
  return {
    mediaAsset: { updateMany: vi.fn(async () => ({ count: 2 })) },
    mediaAssetEmbedding: { deleteMany: vi.fn(async () => ({ count: 1 })) },
  };
}

describe("markAssetsDeletedTx", () => {
  it("помечает живые строки, обнуляет данные визуального поиска и удаляет эмбеддинги", async () => {
    const tx = fakeTx();
    const now = new Date("2026-10-30T09:00:00.000Z");

    expect(await markAssetsDeletedTx(tx as never, ["a1", "a2", "a1"], now)).toBe(2);

    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["a1", "a2"] }, deletedAt: null },
      data: { deletedAt: now, visualDescription: null, visualMeta: Prisma.DbNull, visualCategory: null },
    });
    expect(tx.mediaAssetEmbedding.deleteMany).toHaveBeenCalledWith({ where: { assetId: { in: ["a1", "a2"] } } });
  });

  it("не трогает `visualIndexed` — иначе переиндексация поставила бы удалённое фото в очередь", async () => {
    const tx = fakeTx();
    await markAssetsDeletedTx(tx as never, ["a1"]);
    const [[args]] = tx.mediaAsset.updateMany.mock.calls as unknown as [[{ data: Record<string, unknown> }]];
    expect(args.data).not.toHaveProperty("visualIndexed");
  });

  it("пустой снимок — ни одного запроса", async () => {
    const tx = fakeTx();
    expect(await markAssetsDeletedTx(tx as never, [])).toBe(0);
    expect(tx.mediaAsset.updateMany).not.toHaveBeenCalled();
    expect(tx.mediaAssetEmbedding.deleteMany).not.toHaveBeenCalled();
  });
});
