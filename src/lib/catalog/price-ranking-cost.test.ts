import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-05 (частично) — ранжирование каталога по цене было единственной
 * поверхностью, которая тянула ВСЕ услуги ВСЕХ подходящих провайдеров
 * (`services` и `masterServices` без `take`), хотя от них нужно ровно одно
 * число: минимальная положительная цена. У студии услуг бывают сотни, а
 * сортировка обязана быть глобальной — то есть по всему отфильтрованному
 * набору, а не по странице.
 *
 * Теперь `price > 0` живёт в `where`, а `orderBy price asc` + `take: 1`
 * оставляют ровно ту строку, которую раньше выбирал `Math.min`. Три части
 * СВЯЗАНЫ, и связь неочевидна: убрать `price: { gt: 0 }`, оставив `take: 1`,
 * значит поднять наверх бесплатную услугу — `pickPrice` отфильтрует её как
 * неположительную, увидит пустой список и уйдёт в `priceFrom`, то есть тихо
 * вернёт ДРУГУЮ цену. Ради этой связки тест и существует.
 *
 * STUDIO-MASTER-PROFILES (решение владельца 2026-09-27): карточка профиля
 * показывает только СВОИ услуги (услуги профилей не смешиваются), поэтому и
 * ранжирование читает только их — студийных связей мастера (`MasterService`)
 * в запросе ранкера больше нет вовсе (прежняя развилка
 * CATALOG-CARD-STUDIO-MASTER-SERVICES удалена).
 */

const providerFindMany = vi.hoisted(() => vi.fn());
const providerCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findMany: providerFindMany, count: providerCount },
    globalCategory: { findMany: vi.fn(async () => []) },
    userSubscription: { findMany: vi.fn(async () => []) },
    review: { groupBy: vi.fn(async () => []) },
    hotSlot: { findMany: vi.fn(async () => []) },
  },
}));

import { searchCatalog } from "@/lib/catalog/catalog.service";

type RelationArgs = {
  where: Record<string, unknown>;
  orderBy?: Record<string, unknown>;
  take?: number;
  select?: Record<string, unknown>;
};

async function captureRankerSelect(sort: "price-asc" | "price-desc"): Promise<{
  services: RelationArgs;
  masterServices?: RelationArgs;
}> {
  providerFindMany.mockResolvedValue([]);
  await searchCatalog({ sort, limit: 20 } as Parameters<typeof searchCatalog>[0]);

  const rankerCall = providerFindMany.mock.calls.find(
    (call) => (call[0]?.select as Record<string, unknown> | undefined)?.priceFrom === true
  );
  expect(rankerCall, "ранкер цены обязан сходить в provider.findMany").toBeTruthy();

  const select = rankerCall![0].select as {
    services: RelationArgs;
    masterServices?: RelationArgs;
  };
  return select;
}

describe("PERF-05 · ранжирование по цене не тянет все услуги всех провайдеров", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerCount.mockResolvedValue(0);
  });

  it("собственные услуги: только положительные, по возрастанию, одна строка", async () => {
    const select = await captureRankerSelect("price-asc");

    expect(select.services.take).toBe(1);
    expect(select.services.orderBy).toEqual({ price: "asc" });
    // Без этого условия `take: 1` поднимет бесплатную услугу и цена уедет в `priceFrom`.
    expect(select.services.where).toMatchObject({
      isEnabled: true,
      isActive: true,
      price: { gt: 0 },
    });
  });

  it("студийные связи мастера ранкер не читает — цена карточки только из своих услуг", async () => {
    const select = await captureRankerSelect("price-desc");

    expect(select.masterServices).toBeUndefined();
  });

  it("направление сортировки не влияет на отбор — обе стороны берут МИНИМУМ", async () => {
    // `price-desc` — это «самые дорогие СНАЧАЛА» по той же величине (минимальная
    // цена провайдера), а не «максимальная цена провайдера». Отбор внутри строки
    // обязан остаться возрастающим в обоих направлениях.
    const asc = await captureRankerSelect("price-asc");
    vi.clearAllMocks();
    providerCount.mockResolvedValue(0);
    const desc = await captureRankerSelect("price-desc");

    expect(desc.services.orderBy).toEqual(asc.services.orderBy);
    expect(desc.services.where).toEqual(asc.services.where);
  });
});
