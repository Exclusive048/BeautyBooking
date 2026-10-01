import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SYSTEM-CATEGORIES-01 — фильтр категорий на /models не отбрасывает категории
 * фиксированного набора. Запрос стоял с `isSystem: false`, а этот флаг есть у
 * всех категорий набора и прежнего справочника: при пяти живых предложениях (три
 * в «Маникюре») блок фильтра на /models не рендерился вовсе (замер dev 2026-10-01).
 *
 * Вторая причина пустого фильтра — `NOT: [{ visualSearchSlug: "hot" }]`: в SQL
 * `NOT (col = 'hot')` при `col IS NULL` отбрасывает строку, а `visualSearchSlug`
 * пуст почти у всех категорий (замер dev: 17 одобренных → 0 с этим условием,
 * 17 — с `OR: [{ null }, { not: "hot" }]`).
 *
 * @probe 2026-10-01 (по одной оси):
 *   1. `isSystem: false` возвращён в основной запрос → красный «запрос по
 *      предложениям не ограничивает isSystem»; только в запасной → красный
 *      «запасной список тоже».
 *   2. Исключение `hot` возвращено в форму `NOT: [{ visualSearchSlug: "hot" }]`
 *      → красные оба теста на строке «пустой visualSearchSlug проходит».
 */

const findMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { globalCategory: { findMany } } }));

import { listModelOfferFilterCategories } from "@/lib/model-offers/public.service";

type Where = Record<string, unknown>;

/** Исключение `hot` обязано пропускать категории с пустым `visualSearchSlug`. */
function expectNullSafeNotHot(where: Where): void {
  expect(where, "пустой visualSearchSlug проходит").not.toHaveProperty("NOT");
  expect(where.OR, "пустой visualSearchSlug проходит").toEqual(
    expect.arrayContaining([{ visualSearchSlug: null }, { visualSearchSlug: { not: "hot" } }]),
  );
}

beforeEach(() => {
  findMany.mockReset();
});

describe("фильтр категорий /models", () => {
  it("запрос по предложениям не ограничивает isSystem — категория набора проходит", async () => {
    findMany.mockResolvedValueOnce([{ id: "syscat_manicure", name: "Маникюр" }]);
    const result = await listModelOfferFilterCategories();
    expect(result).toEqual([{ id: "syscat_manicure", name: "Маникюр" }]);
    const where = findMany.mock.calls[0]![0].where as Where;
    expect(where).not.toHaveProperty("isSystem");
    expect(where).toMatchObject({ status: "APPROVED", visibleToAll: true });
    expectNullSafeNotHot(where);
  });

  it("запасной список (предложений нет) тоже", async () => {
    findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: "syscat_makeup", name: "Макияж" }]);
    const result = await listModelOfferFilterCategories();
    expect(result).toEqual([{ id: "syscat_makeup", name: "Макияж" }]);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[1]![0].where as Where).not.toHaveProperty("isSystem");
    expectNullSafeNotHot(findMany.mock.calls[1]![0].where as Where);
  });
});
