import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

/**
 * VISUAL-SEARCH-UNRECOGNIZED-01 — фото, которые сломанный конвейер пометил
 * нераспознанными, переиндексируются ОДИН раз на версию конвейера; повторный
 * старт воркера платных вызовов не повторяет, а выключенный поиск метку не
 * ставит (прогон случится при включении).
 *
 * Метка захватывается атомарно ДО постановки задач (иначе падение между
 * постановкой и меткой или два воркера на перекрытии деплоя оплатили бы прогон
 * дважды), а нераспознанные обходятся ВСЕ — страницами по курсору, не одной
 * пачкой в 500.
 *
 * @probe 2026-09-23 — в `requeueAfterPipelineChangeOnce` убран захват метки
 * (всегда `true`): красный «вторая попытка той же версии — без прогона». Убрана
 * проверка включённости: красный «поиск выключен — ни прогона, ни метки».
 * Цикл по страницам заменён одной пачкой: красный «обходит всех нераспознанных
 * страницами». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  enabled: true,
  order: [] as string[],
  findMany: vi.fn(),
  assetUpdateMany: vi.fn(async () => ({ count: 0 })),
  configUpdateMany: vi.fn(async () => ({ count: 0 })),
  configCreate: vi.fn(async () => ({})),
  enqueue: vi.fn(async () => {}),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    mediaAsset: { findMany: mocks.findMany, updateMany: mocks.assetUpdateMany },
    systemConfig: { updateMany: mocks.configUpdateMany, create: mocks.configCreate },
  },
}));
vi.mock("@/lib/queue/queue", () => ({ enqueue: mocks.enqueue }));
vi.mock("@/lib/visual-search/config", () => ({
  getVisualSearchConfig: vi.fn(async () => ({ enabled: mocks.enabled })),
}));

import { REINDEX_BATCH_SIZE, requeueAfterPipelineChangeOnce } from "@/lib/visual-search/reindex";
import { VISUAL_PIPELINE_VERSION } from "@/lib/visual-search/pipeline-version";

function ids(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}${String(i).padStart(4, "0")}` }));
}

beforeEach(() => {
  mocks.enabled = true;
  mocks.order = [];
  mocks.findMany.mockReset();
  mocks.findMany.mockImplementation(async () => {
    mocks.order.push("findMany");
    return [{ id: "a1" }, { id: "a2" }];
  });
  mocks.assetUpdateMany.mockClear();
  mocks.configUpdateMany.mockReset();
  mocks.configUpdateMany.mockImplementation(async () => {
    mocks.order.push("claim");
    return { count: 0 };
  });
  mocks.configCreate.mockReset();
  mocks.configCreate.mockResolvedValue({});
  mocks.enqueue.mockClear();
});

describe("разовая переиндексация после смены конвейера", () => {
  it("первый старт — метка захвачена ДО работы, нераспознанные снова в очереди", async () => {
    await expect(requeueAfterPipelineChangeOnce()).resolves.toEqual({ ran: true, enqueued: 2 });
    expect(mocks.order[0]).toBe("claim");
    expect(mocks.configCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ value: VISUAL_PIPELINE_VERSION }),
    });
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ visualCategory: null, visualIndexed: true }),
      }),
    );
    expect(mocks.assetUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { visualIndexed: false, visualIndexedAt: null } }),
    );
    expect(mocks.enqueue).toHaveBeenCalledTimes(2);
  });

  it("метка старой версии перезаписывается — прогон есть", async () => {
    mocks.configUpdateMany.mockResolvedValueOnce({ count: 1 });
    await expect(requeueAfterPipelineChangeOnce()).resolves.toEqual({ ran: true, enqueued: 2 });
    expect(mocks.configCreate).not.toHaveBeenCalled();
  });

  it("вторая попытка той же версии — без прогона", async () => {
    mocks.configCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "6" }),
    );
    await expect(requeueAfterPipelineChangeOnce()).resolves.toEqual({ ran: false, enqueued: 0 });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  });

  it("поиск выключен — ни прогона, ни метки", async () => {
    mocks.enabled = false;
    await expect(requeueAfterPipelineChangeOnce()).resolves.toEqual({ ran: false, enqueued: 0 });
    expect(mocks.findMany).not.toHaveBeenCalled();
    expect(mocks.configUpdateMany).not.toHaveBeenCalled();
    expect(mocks.configCreate).not.toHaveBeenCalled();
  });

  it("обходит всех нераспознанных страницами по курсору, а не одну пачку", async () => {
    const first = ids("a", REINDEX_BATCH_SIZE);
    mocks.findMany.mockReset();
    mocks.findMany.mockResolvedValueOnce(first).mockResolvedValueOnce(ids("b", 3));
    await expect(requeueAfterPipelineChangeOnce()).resolves.toEqual({
      ran: true,
      enqueued: REINDEX_BATCH_SIZE + 3,
    });
    expect(mocks.findMany).toHaveBeenCalledTimes(2);
    expect(mocks.findMany.mock.calls[1]![0].where.id).toEqual({ gt: first[first.length - 1]!.id });
  });
});
