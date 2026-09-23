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
 * CATALOG-CARD-STUDIO-MASTER-SERVICES (2026-09-23): связка сохранена для
 * СОБСТВЕННЫХ услуг (их у студии сотни). Студийные связи мастера (`MasterService`)
 * читаются без `take`: цена карточки — `priceOverride ?? service.price`, и её
 * минимум порядком по `service.price` не выразить, а связей у мастера десятки
 * (у провайдера-студии — ни одной). Развилку «свои есть → только свои» держит
 * фильтрованный `_count.services`, а не `services.length`: у мастера, чьи свои
 * услуги все бесплатные, `take: 1` с `price > 0` вернул бы пусто, и ранкер
 * ушёл бы в студийные связи, которые карточка не показывает.
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
  masterServices: RelationArgs;
  _count: { select: { services: { where: Record<string, unknown> } } };
}> {
  providerFindMany.mockResolvedValue([]);
  await searchCatalog({ sort, limit: 20 } as Parameters<typeof searchCatalog>[0]);

  const rankerCall = providerFindMany.mock.calls.find(
    (call) => (call[0]?.select as Record<string, unknown> | undefined)?.priceFrom === true
  );
  expect(rankerCall, "ранкер цены обязан сходить в provider.findMany").toBeTruthy();

  const select = rankerCall![0].select as {
    services: RelationArgs;
    masterServices: RelationArgs;
    _count: { select: { services: { where: Record<string, unknown> } } };
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

  it("услуги через MasterService: включённые связи с переопределением цены", async () => {
    const select = await captureRankerSelect("price-desc");

    expect(select.masterServices.where).toMatchObject({
      isEnabled: true,
      service: { isEnabled: true, isActive: true },
    });
    expect(select.masterServices.select).toMatchObject({ priceOverride: true });
  });

  it("развилка «свои есть» — по счётчику ВСЕХ включённых своих услуг, не по цене", async () => {
    const select = await captureRankerSelect("price-asc");

    expect(select._count.select.services.where).toEqual({ isEnabled: true, isActive: true });
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
    expect(desc.masterServices).toEqual(asc.masterServices);
  });
});
