import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  DB_RESET_KEPT_TABLES,
  DB_RESET_REQUEST_PATH,
  buildTruncateSql,
  decideDbReset,
  findKeptTableViolations,
  parseDbResetRequest,
  planTablesToWipe,
  readAppliedResetId,
  type ForeignKeyEdge,
} from "@/lib/ops/database-reset";

/**
 * DB-RESET-01 — правила разовой очистки боевой базы.
 *
 * @probe 2026-10-13: в `DB_RESET_KEPT_TABLES` добавлен "GlobalCategory" →
 * «оставляемые таблицы не ссылаются на очищаемые» покраснел с
 * `GlobalCategory → UserProfile`, `GlobalCategory → Provider`; в deploy.yml шаг
 * очистки перенесён выше снимка 4/7 → «очистка идёт после снимка» покраснел.
 * Обе правки откачены.
 */

const REPO_ROOT = resolve(__dirname, "../../..");

/** Связи схемы в форме `pg_constraint`: таблица, держащая внешний ключ → таблица, на которую он указывает. */
function schemaForeignKeys(): ForeignKeyEdge[] {
  const models = Prisma.dmmf.datamodel.models;
  const tableOf = new Map(models.map((model) => [model.name, model.dbName ?? model.name]));
  const edges: ForeignKeyEdge[] = [];
  for (const model of models) {
    for (const field of model.fields) {
      if (field.kind !== "object" || (field.relationFromFields?.length ?? 0) === 0) continue;
      edges.push({
        name: `${model.name}.${field.name}`,
        fromTable: tableOf.get(model.name) ?? model.name,
        toTable: tableOf.get(field.type) ?? field.type,
      });
    }
  }
  return edges;
}

function schemaTables(): string[] {
  return Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name);
}

describe("разовая очистка базы: что остаётся", () => {
  it("оставляемые таблицы не ссылаются на очищаемые (иначе TRUNCATE откажет или потянет их за собой)", () => {
    const violations = findKeptTableViolations(schemaForeignKeys(), DB_RESET_KEPT_TABLES);
    expect(
      violations.map((edge) => `${edge.fromTable} → ${edge.toTable} (${edge.name})`),
      "Оставляемая таблица ссылается на очищаемую: уберите её из DB_RESET_KEPT_TABLES " +
        "или оставьте и ту, на которую она ссылается.",
    ).toEqual([]);
  });

  it("проверка связей не вакуумна: таблица со ссылкой на аккаунты в списке оставляемых — нарушение", () => {
    const violations = findKeptTableViolations(schemaForeignKeys(), [...DB_RESET_KEPT_TABLES, "GlobalCategory"]);
    expect(violations.map((edge) => edge.toTable)).toEqual(
      expect.arrayContaining(["UserProfile", "Provider"]),
    );
  });

  it("каждая оставляемая таблица есть в схеме (переименование не должно молча сузить список)", () => {
    const tables = new Set(schemaTables());
    const unknown = DB_RESET_KEPT_TABLES.filter((table) => table !== "_prisma_migrations" && !tables.has(table));
    expect(unknown).toEqual([]);
  });

  it("очищается всё, кроме оставляемого, включая таблицы, которых в списках нет", () => {
    const wipe = planTablesToWipe([...schemaTables(), "_prisma_migrations", "SomeFutureTable"], DB_RESET_KEPT_TABLES);
    expect(wipe).toContain("UserProfile");
    expect(wipe).toContain("Booking");
    expect(wipe).toContain("media_asset_embeddings");
    expect(wipe).toContain("SomeFutureTable");
    for (const kept of DB_RESET_KEPT_TABLES) expect(wipe).not.toContain(kept);
  });
});

describe("разовая очистка базы: запрос и решение", () => {
  const request = { id: "fresh-start-2026-10", notAfter: "2026-10-20" };

  it("разбирает корректный запрос", () => {
    expect(parseDbResetRequest({ ...request })).toEqual(request);
  });

  it.each([
    ["не объект", null],
    ["массив", []],
    ["без id", { notAfter: "2026-10-20" }],
    ["id с пробелом", { id: "fresh start", notAfter: "2026-10-20" }],
    ["id заглавными", { id: "FRESH", notAfter: "2026-10-20" }],
    ["без даты", { id: "fresh-start" }],
    ["дата не по формату", { id: "fresh-start", notAfter: "20.10.2026" }],
    ["несуществующая дата", { id: "fresh-start", notAfter: "2026-02-30" }],
  ])("кривой запрос — ошибка, а не пропуск: %s", (_label, raw) => {
    expect(() => parseDbResetRequest(raw)).toThrow();
  });

  it("срабатывает до даты notAfter включительно", () => {
    expect(decideDbReset({ request, todayUtc: "2026-10-13", appliedId: null })).toEqual({ action: "apply" });
    expect(decideDbReset({ request, todayUtc: "2026-10-20", appliedId: null })).toEqual({ action: "apply" });
  });

  it("просроченный запрос не срабатывает", () => {
    expect(decideDbReset({ request, todayUtc: "2026-10-21", appliedId: null })).toEqual({
      action: "skip",
      reason: "expired",
    });
  });

  it("выполненный запрос не срабатывает повторно, другой id — срабатывает", () => {
    expect(decideDbReset({ request, todayUtc: "2026-10-13", appliedId: request.id })).toEqual({
      action: "skip",
      reason: "already-done",
    });
    expect(decideDbReset({ request, todayUtc: "2026-10-13", appliedId: "older-reset" })).toEqual({ action: "apply" });
  });

  it("отметку читает только из объекта с id", () => {
    expect(readAppliedResetId({ id: "fresh-start-2026-10", appliedAt: "x" })).toBe("fresh-start-2026-10");
    expect(readAppliedResetId("fresh-start-2026-10")).toBeNull();
    expect(readAppliedResetId({ id: "" })).toBeNull();
    expect(readAppliedResetId(null)).toBeNull();
  });

  it("файл запроса в репозитории, если есть, разбирается и действует не дольше месяца", () => {
    const path = resolve(REPO_ROOT, DB_RESET_REQUEST_PATH);
    if (!existsSync(path)) return;
    const parsed = parseDbResetRequest(JSON.parse(readFileSync(path, "utf8")));
    const limit = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(parsed.notAfter <= limit, `notAfter ${parsed.notAfter} дальше месяца — забытый запрос опасен`).toBe(true);
  });
});

describe("разовая очистка базы: SQL", () => {
  it("один TRUNCATE без CASCADE: пропущенная связь на справочник — ошибка, а не тихая очистка", () => {
    const sql = buildTruncateSql(["Booking", "UserProfile"]);
    expect(sql).toBe('TRUNCATE TABLE "Booking", "UserProfile" RESTART IDENTITY');
    expect(sql).not.toMatch(/CASCADE/i);
  });

  it("экранирует кавычки в имени таблицы", () => {
    expect(buildTruncateSql(['we"ird'])).toBe('TRUNCATE TABLE "we""ird" RESTART IDENTITY');
  });

  it("пустой список — ошибка", () => {
    expect(() => buildTruncateSql([])).toThrow();
  });
});

describe("разовая очистка базы: место в деплое", () => {
  const deploy = readFileSync(resolve(REPO_ROOT, ".github/workflows/deploy.yml"), "utf8");
  const at = (needle: string): number => {
    const index = deploy.indexOf(needle);
    expect(index, `в deploy.yml не найдено: ${needle}`).toBeGreaterThanOrEqual(0);
    return index;
  };

  it("очистка идёт после снимка и миграций, до сида тарифов, пост-деплоя и подъёма", () => {
    const reset = at("ops:reset-db -- --apply");
    expect(at("pg_dump --format=custom")).toBeLessThan(reset);
    expect(at("=== 5/7 Миграции ===")).toBeLessThan(reset);
    expect(reset).toBeLessThan(at("migrate npm run seed:plans"));
    expect(reset).toBeLessThan(at("migrate npm run deploy:post"));
    expect(reset).toBeLessThan(at("$COMPOSE up -d --remove-orphans"));
  });

  it("шаг смотрит на тот же файл запроса, что и скрипт", () => {
    expect(deploy).toContain(`if [ -f ${DB_RESET_REQUEST_PATH} ]; then`);
  });
});
