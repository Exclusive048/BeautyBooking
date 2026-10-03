import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { isCategoryIcon } from "@/lib/catalog/category-icon";
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
 *
 * SYSTEM-CATEGORIES-02 — новые названия, @probe 2026-10-03 (по одной оси):
 *   1. В миграции переименования «Оформление бровей» → «Оформление  бровей» →
 *      красный «каждое переименование — из прежнего названия в нынешнее».
 *   2. У `hairstyle` убраны `formerNames` → три красных: ручная категория с
 *      прежним названием, строка первой миграции, строка переименования.
 *   3. `planSystemCategoryCreates` сверяет только нынешнее название → красный
 *      «ручная категория с ПРЕЖНИМ названием — тоже эта категория».
 *   4. Из миграции переименования убрана строка `depilation` → красные
 *      «строки разобраны» и «у каждого прежнего названия … есть переименование».
 *
 * CATEGORY-ICONS-01 — смайлики строкам, что были до набора, @probe 2026-10-03
 * (по одной оси):
 *   1. В миграции смайликов у «Ресницы» «👁️» заменён на «👀» → красный «смайлик
 *      каждой строки — из списка кода» с именем строки `eyelashes`.
 *   2. Из миграции убрана строка («depilation», «Депиляция и шугаринг») →
 *      красные «строки разобраны» и «каждое название … сверяется».
 *   3. Из условия убрано «смайлик пуст» → красный «только UPDATE смайлика …».
 *
 * Поведение SQL переименования проверено на dev-базе в транзакции с откатом:
 * обе миграции подряд → «Оформление бровей», «Восковая депиляция и шугаринг»;
 * строка, переименованная «админом», и строка при ручной «  причёски  и
 * укладки » на верхнем уровне остались как были; повторный прогон — UPDATE 0.
 */

const MIGRATIONS = join(process.cwd(), "prisma/schema/migrations");
const INITIAL_MIGRATION = join(MIGRATIONS, "20261001124736_system_categories/migration.sql");
const RENAME_MIGRATION = join(MIGRATIONS, "20261003120000_system_categories_names/migration.sql");
const ICONS_MIGRATION = join(MIGRATIONS, "20261003130000_system_categories_icons/migration.sql");

/** SQL миграции без комментариев: в них названия в кавычках «…» тоже встречаются. */
function migrationSql(path: string): string {
  return readFileSync(path, "utf8").replace(/--[^\n]*/g, "");
}

/** Строки `VALUES` первой миграции: ('slug', 'name', 'icon', order). */
function migrationRows(): Array<{ slug: string; name: string; icon: string; orderIndex: number }> {
  const rows = [...migrationSql(INITIAL_MIGRATION).matchAll(/\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+)\s*\)/g)];
  return rows.map(([, slug, name, icon, order]) => ({ slug, name, icon, orderIndex: Number(order) }));
}

/** Строки `VALUES` из трёх строковых значений: ('a', 'b', 'c'). */
function tripleRows(path: string): Array<[string, string, string]> {
  const rows = [...migrationSql(path).matchAll(/\(\s*'([^']+)',\s*'([^']+)',\s*'([^']+)'\s*\)/g)];
  return rows.map(([, a, b, c]) => [a, b, c]);
}

/** Строки `VALUES` миграции переименования: ('slug', 'прежнее', 'новое'). */
function renameRows(): Array<{ slug: string; fromName: string; toName: string }> {
  return tripleRows(RENAME_MIGRATION).map(([slug, fromName, toName]) => ({ slug, fromName, toName }));
}

/** Строки `VALUES` миграции смайликов: ('slug', 'название', 'смайлик'). */
function iconRows(): Array<{ slug: string; name: string; icon: string }> {
  return tripleRows(ICONS_MIGRATION).map(([slug, name, icon]) => ({ slug, name, icon }));
}

const BY_SLUG = new Map(SYSTEM_CATEGORIES.map((c) => [c.slug, c]));

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

  it("прежнее название не совпадает ни с одним нынешним — переименование однозначно", () => {
    const current = new Set(SYSTEM_CATEGORIES.map((c) => c.name));
    for (const category of SYSTEM_CATEGORIES) {
      for (const former of category.formerNames ?? []) {
        expect(current.has(former), `${category.slug}: ${former}`).toBe(false);
      }
    }
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
    const manual: ExistingCategory[] = [{ slug: "custom-brows-1", name: " оформление  БРОВЕЙ", parentId: null }];
    expect(planSystemCategoryCreates(manual).map((c) => c.slug)).not.toContain("eyebrows");
  });

  it("ручная категория с ПРЕЖНИМ названием — тоже эта категория, дубль под новым не заводится", () => {
    const manual: ExistingCategory[] = [{ slug: "custom-hair-1", name: "  прически ", parentId: null }];
    expect(planSystemCategoryCreates(manual).map((c) => c.slug)).not.toContain("hairstyle");
  });

  it("одноимённая подкатегория не мешает: набор — верхний уровень", () => {
    const nested: ExistingCategory[] = [{ slug: "nails-depil", name: "Восковая депиляция и шугаринг", parentId: "x" }];
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
      data: {
        slug: "eyebrows",
        name: "Оформление бровей",
        parentId: null,
        status: "APPROVED",
        visibleToAll: true,
        isSystem: true,
      },
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

  it("каждая строка миграции есть в списке кода — под нынешним или прежним названием", () => {
    for (const row of migrationRows()) {
      const category = BY_SLUG.get(row.slug);
      expect(category, row.slug).toBeDefined();
      expect({ icon: category!.icon, orderIndex: category!.orderIndex }, row.slug).toEqual({
        icon: row.icon,
        orderIndex: row.orderIndex,
      });
      expect([category!.name, ...(category!.formerNames ?? [])], row.slug).toContain(row.name);
    }
  });

  it("миграция ничего не дропает и не меняет существующие строки", () => {
    expect(migrationSql(INITIAL_MIGRATION)).not.toMatch(/\b(DROP|UPDATE|DELETE|ALTER)\b/i);
  });
});

describe("миграция данных 20261003120000_system_categories_names", () => {
  it("строки разобраны (иначе проверки ниже вакуумны)", () => {
    expect(renameRows()).toHaveLength(4);
  });

  it("каждое переименование — из прежнего названия в нынешнее по списку кода", () => {
    for (const row of renameRows()) {
      const category = BY_SLUG.get(row.slug);
      expect(category, row.slug).toBeDefined();
      expect(row.toName, row.slug).toBe(category!.name);
      expect(category!.formerNames ?? [], row.slug).toContain(row.fromName);
    }
  });

  it("у каждого прежнего названия в коде есть переименование уже созданных строк", () => {
    const renamed = new Set(renameRows().map((row) => `${row.slug}:${row.fromName}`));
    for (const category of SYSTEM_CATEGORIES) {
      for (const former of category.formerNames ?? []) {
        expect(renamed.has(`${category.slug}:${former}`), `${category.slug}: ${former}`).toBe(true);
      }
    }
  });

  it("только UPDATE названий категорий: ничего не создаёт, не удаляет и не дропает", () => {
    const sql = migrationSql(RENAME_MIGRATION);
    expect(sql).not.toMatch(/\b(DROP|DELETE|ALTER|INSERT|TRUNCATE)\b/i);
    expect(sql.match(/\bUPDATE\s+"(\w+)"/gi)).toEqual(['UPDATE "GlobalCategory"']);
  });
});

describe("миграция данных 20261003130000_system_categories_icons", () => {
  const allNames = SYSTEM_CATEGORIES.flatMap((c) => [c.name, ...(c.formerNames ?? [])].map((name) => ({ slug: c.slug, name })));

  it("строки разобраны (иначе проверки ниже вакуумны)", () => {
    expect(iconRows()).toHaveLength(allNames.length);
  });

  it("смайлик каждой строки — из списка кода, и это ровно один смайлик", () => {
    for (const row of iconRows()) {
      const category = BY_SLUG.get(row.slug);
      expect(category, row.slug).toBeDefined();
      expect(row.icon, row.slug).toBe(category!.icon);
      expect(isCategoryIcon(row.icon), row.slug).toBe(true);
      expect([category!.name, ...(category!.formerNames ?? [])], row.slug).toContain(row.name);
    }
  });

  it("каждое название набора — нынешнее и прежнее — сверяется с категориями верхнего уровня", () => {
    const covered = new Set(iconRows().map((row) => `${row.slug}:${row.name}`));
    for (const { slug, name } of allNames) {
      expect(covered.has(`${slug}:${name}`), `${slug}: ${name}`).toBe(true);
    }
  });

  it("только UPDATE смайлика категорий и только там, где он пуст", () => {
    const sql = migrationSql(ICONS_MIGRATION);
    expect(sql).not.toMatch(/\b(DROP|DELETE|ALTER|INSERT|TRUNCATE)\b/i);
    expect(sql.match(/\bUPDATE\s+"(\w+)"/gi)).toEqual(['UPDATE "GlobalCategory"']);
    expect(sql).toMatch(/SET\s+"icon"\s*=\s*v\."icon",\s*"updatedAt"\s*=\s*CURRENT_TIMESTAMP\s+FROM/);
    expect(sql).toMatch(/WHERE\s+\(g\."icon"\s+IS\s+NULL\s+OR\s+btrim\(g\."icon"\)\s*=\s*''\)\s+AND/);
  });
});
