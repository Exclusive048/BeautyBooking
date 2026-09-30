import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VISIBILITY-CATALOG-STATUS — статус «в каталоге / чего не хватает» выводится
 * из ТЕХ ЖЕ условий, что и предикат выдачи, а не из второй копии правила.
 *
 * @probe 2026-09-23 — в `catalogVisibleProviderWhere` убрано условие адреса
 * (`...conditions.address`): красный «предикат — ровно
 * конъюнкция условий статуса». В `resolveCatalogPresence` порядок пробелов
 * заменён на обратный: красный «пробелы в порядке исправления». Возвращено —
 * зелёный.
 */

const providerCount = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { count: providerCount } } }));

import { resolveCatalogPresence } from "@/lib/providers/catalog-presence";
import {
  catalogPresenceConditions,
  catalogVisibleProviderWhere,
} from "@/lib/providers/catalog-visibility";

type Where = Record<string, unknown>;

/** Двойник БД: провайдер «удовлетворяет» условию, если его ключ не в `failing`. */
function db(failing: Array<"isPublished" | "cityId" | "OR">, exists = true) {
  providerCount.mockImplementation(async ({ where }: { where: Where }) => {
    if (!exists) return 0;
    return Object.keys(where).some((key) => (failing as string[]).includes(key)) ? 0 : 1;
  });
}

beforeEach(() => {
  providerCount.mockReset();
});

describe("catalogVisibleProviderWhere", () => {
  it("предикат — ровно конъюнкция условий статуса", () => {
    const now = new Date("2026-09-28T09:00:00Z");
    const conditions = catalogPresenceConditions(now);
    expect(catalogVisibleProviderWhere(now)).toEqual({
      ...conditions.hidden,
      ...conditions.address,
      ...conditions.schedule,
    });
    expect(Object.keys(catalogVisibleProviderWhere(now)).sort()).toEqual(["OR", "cityId", "isPublished"]);
  });
});

describe("resolveCatalogPresence", () => {
  it("все условия выполнены — в каталоге", async () => {
    db([]);
    await expect(resolveCatalogPresence("p1")).resolves.toEqual({ listed: true, gaps: [] });
  });

  it("пробелы в порядке исправления: видимость, адрес, расписание", async () => {
    db(["isPublished", "cityId", "OR"]);
    await expect(resolveCatalogPresence("p1")).resolves.toEqual({
      listed: false,
      gaps: ["hidden", "address", "schedule"],
    });
  });

  it("нет только расписания", async () => {
    db(["OR"]);
    await expect(resolveCatalogPresence("p1")).resolves.toEqual({ listed: false, gaps: ["schedule"] });
  });

  it("провайдера нет — null", async () => {
    db([], false);
    await expect(resolveCatalogPresence("missing")).resolves.toBeNull();
  });
});
