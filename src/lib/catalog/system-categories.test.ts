import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import {
  SYSTEM_CATEGORIES,
  ensureSystemCategories,
  planSystemCategoryCreates,
  type ExistingCategory,
} from "@/lib/catalog/system-categories";

/**
 * SYSTEM-CATEGORIES-01 — фиксированный набор категорий: только досоздание.
 *
 * @probe 2026-10-01 (по одной оси):
 *   1. В `planSystemCategoryCreates` убрано условие по названию (остался один
 *      слаг) → красный «одноимённая ручная категория верхнего уровня — дубль не
 *      заводится» (в плане появился `hairstyle` рядом с ручной «прически»).
 *   2. В миграции у «Брови» иконка заменена на «✏️» → красный «каждая строка
 *      миграции есть в списке кода» с именем строки `eyebrows`.
 *   3. `ensureSystemCategories` переписан на `upsert` (как прежний справочный
 *      сид) → красные все три теста `ensureSystemCategories`, первым —
 *      «существующие строки не трогаются»: у двойника базы нет метода `upsert`.
 */

const MIGRATION = join(
  process.cwd(),
  "prisma/schema/migrations/20261001124736_system_categories/migration.sql",
);

/** Строки `VALUES` миграции: ('slug', 'name', 'icon', order). */
function migrationRows(): Array<{ slug: string; name: string; icon: string; orderIndex: number }> {
  const sql = readFileSync(MIGRATION, "utf8");
  const rows = [...sql.matchAll(/\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+)\s*\)/g)];
  return rows.map(([, slug, name, icon, order]) => ({ slug, name, icon, orderIndex: Number(order) }));
}

/** Прежний справочник PWA-FIX-01 — то, что лежит в dev-базе и, возможно, на проде. */
const LEGACY_REFERENCE: ExistingCategory[] = [
  { slug: "nails", name: "Маникюр и педикюр", parentId: null },
  { slug: "hair", name: "Парикмахерские услуги", parentId: null },
  { slug: "brows", name: "Брови и ресницы", parentId: null },
  { slug: "skin", name: "Косметология и уход", parentId: null },
  { slug: "massage", name: "Массаж и СПА", parentId: null },
  { slug: "makeup", name: "Макияж", parentId: null },
  { slug: "manicure", name: "Маникюр", parentId: "nails-id" },
  { slug: "pedicure", name: "Педикюр", parentId: "nails-id" },
  { slug: "haircut", name: "Стрижка", parentId: "hair-id" },
  { slug: "coloring", name: "Окрашивание", parentId: "hair-id" },
  { slug: "lashes", name: "Наращивание ресниц", parentId: "brows-id" },
  { slug: "browarchitect", name: "Оформление бровей", parentId: "brows-id" },
];

describe("набор системных категорий", () => {
  it("девять категорий, слаги и названия не повторяются", () => {
    expect(SYSTEM_CATEGORIES).toHaveLength(9);
    expect(new Set(SYSTEM_CATEGORIES.map((c) => c.slug)).size).toBe(9);
    expect(new Set(SYSTEM_CATEGORIES.map((c) => c.name)).size).toBe(9);
  });
});

describe("planSystemCategoryCreates", () => {
  it("пустая база — создаётся весь набор", () => {
    expect(planSystemCategoryCreates([]).map((c) => c.slug)).toEqual(SYSTEM_CATEGORIES.map((c) => c.slug));
  });

  it("прежний справочник — досоздаются только недостающие, «Брови и ресницы» не выдаёт себя за «Брови»", () => {
    expect(planSystemCategoryCreates(LEGACY_REFERENCE).map((c) => c.slug)).toEqual([
      "eyebrows",
      "eyelashes",
      "instant-tan",
      "hairstyle",
      "depilation",
    ]);
  });

  it("одноимённая ручная категория верхнего уровня — дубль не заводится", () => {
    const manual: ExistingCategory[] = [{ slug: "custom-hair-1", name: "  прически ", parentId: null }];
    expect(planSystemCategoryCreates(manual).map((c) => c.slug)).not.toContain("hairstyle");
  });

  it("одноимённая подкатегория не мешает: набор — верхний уровень", () => {
    const nested: ExistingCategory[] = [{ slug: "nails-depil", name: "Депиляция и шугаринг", parentId: "x" }];
    expect(planSystemCategoryCreates(nested).map((c) => c.slug)).toContain("depilation");
  });

  it("занятый слаг — категория есть, как бы она теперь ни называлась", () => {
    const renamed: ExistingCategory[] = [{ slug: "instant-tan", name: "Автозагар", parentId: null }];
    expect(planSystemCategoryCreates(renamed).map((c) => c.slug)).not.toContain("instant-tan");
  });
});

describe("ensureSystemCategories", () => {
  function fakeDb(existing: ExistingCategory[], createImpl?: (args: { data: { slug: string } }) => Promise<unknown>) {
    const create = vi.fn(createImpl ?? (async () => ({})));
    const findMany = vi.fn(async () => existing);
    // Только чтение и вставка: `update` / `upsert` / `delete` у двойника нет —
    // любая попытка тронуть существующую строку падает.
    return { db: { globalCategory: { findMany, create } } as never, create, findMany };
  }

  it("существующие строки не трогаются: только create, по одному на недостающую", async () => {
    const { db, create } = fakeDb(LEGACY_REFERENCE);
    const result = await ensureSystemCategories(db);
    expect(result.created).toEqual(["eyebrows", "eyelashes", "instant-tan", "hairstyle", "depilation"]);
    expect(create).toHaveBeenCalledTimes(5);
    expect(create.mock.calls[0]![0]).toMatchObject({
      data: { slug: "eyebrows", name: "Брови", parentId: null, status: "APPROVED", visibleToAll: true, isSystem: true },
    });
  });

  it("гонка за слаг (P2002) — категория уже есть, прогон продолжается", async () => {
    const conflict = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "test" });
    const { db } = fakeDb([], async ({ data }) => {
      if (data.slug === "makeup") throw conflict;
      return {};
    });
    const result = await ensureSystemCategories(db);
    expect(result.created).not.toContain("makeup");
    expect(result.created).toHaveLength(8);
  });

  it("другая ошибка базы не глотается", async () => {
    const { db } = fakeDb([], async () => {
      throw new Error("connection lost");
    });
    await expect(ensureSystemCategories(db)).rejects.toThrow("connection lost");
  });
});

describe("миграция данных 20261001124736_system_categories", () => {
  it("строки разобраны (иначе проверка ниже вакуумна)", () => {
    expect(migrationRows()).toHaveLength(9);
  });

  it("каждая строка миграции есть в списке кода", () => {
    const code = new Map(SYSTEM_CATEGORIES.map((c) => [c.slug, c]));
    for (const row of migrationRows()) {
      expect(code.get(row.slug), row.slug).toEqual(row);
    }
  });

  it("миграция ничего не дропает и не меняет существующие строки", () => {
    const sql = readFileSync(MIGRATION, "utf8").replace(/--[^\n]*/g, "");
    expect(sql).not.toMatch(/\b(DROP|UPDATE|DELETE|ALTER)\b/i);
  });
});
