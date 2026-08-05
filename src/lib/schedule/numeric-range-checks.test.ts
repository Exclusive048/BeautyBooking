import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { RAW_SQL_OBJECT_NAMES } from "../../../scripts/raw-sql-objects.mjs";

/**
 * LOGIC-20 — числовые бизнес-диапазоны держались ИСКЛЮЧИТЕЛЬНО на Zod и ручных
 * проверках. Эксплуатируемого дефекта нет: все сегодняшние пути записи
 * валидируют. Дефект в другом — защита существует ровно там, где кто-то её
 * написал, поэтому новый путь записи, миграция данных или сид сохранят
 * отрицательную цену и нулевую длительность без единого возражения БД. Тот же
 * класс, что инв. #35/#38: инвариант, живущий только в приложении.
 *
 * Prisma CHECK-констрейнты в датамодели не выражает и в diff их ИГНОРИРУЕТ
 * (проверено пробной `migrate dev --create-only` на неизменной датамодели —
 * в отличие от hnsw-индекса, их DROP в новые миграции не дописывается). Из
 * этого следует и сила, и слабость: ловушка «снять строку руками» не
 * размножается, но и пропажу констрейнта ни один prisma-гейт не заметит.
 * Поэтому имена внесены в реестр — их сторожит `check:migration-drops`.
 */

const MIGRATIONS_DIR = resolve(process.cwd(), "prisma/schema/migrations");

const EXPECTED = [
  {
    name: "BookingServiceItem_priceSnapshot_nonnegative_check",
    predicate: /"priceSnapshot"\s*>=\s*0/,
  },
  {
    name: "BookingServiceItem_durationSnapshotMin_positive_check",
    predicate: /"durationSnapshotMin"\s*>\s*0/,
  },
  { name: "Review_rating_range_check", predicate: /"rating"\s+BETWEEN\s+1\s+AND\s+5/i },
  {
    name: "Provider_bufferBetweenBookingsMin_range_check",
    predicate: /"bufferBetweenBookingsMin"\s+BETWEEN\s+0\s+AND\s+30/i,
  },
];

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((entry) => !entry.endsWith(".toml"))
    .map((dir) => {
      try {
        return readFileSync(join(MIGRATIONS_DIR, dir, "migration.sql"), "utf8");
      } catch {
        return "";
      }
    })
    .join("\n");
}

describe("CHECK-констрейнты на числовые диапазоны — LOGIC-20", () => {
  const sql = allMigrationSql();

  for (const item of EXPECTED) {
    it(`${item.name} создан миграцией`, () => {
      expect(sql).toContain(`ADD CONSTRAINT "${item.name}"`);
      expect(sql).toMatch(item.predicate);
    });

    it(`${item.name} внесён в реестр сырых объектов`, () => {
      // Prisma этих объектов не видит вовсе, поэтому её собственные гейты о
      // пропаже не скажут — сторожит только реестр + check:migration-drops.
      expect(RAW_SQL_OBJECT_NAMES).toContain(item.name);
    });
  }

  it("границы не шире прикладных — иначе БД отвергнет то, что приложение считает валидным", () => {
    // Потолок буфера в БД обязан совпадать с потолком normalizeBufferMinutes:
    // если БД строже, легальное сохранение настроек начнёт падать.
    const core = readFileSync(resolve(process.cwd(), "src/lib/bookings/booking-core.ts"), "utf8");
    expect(core).toMatch(/Math\.min\(30,/);
  });
});
