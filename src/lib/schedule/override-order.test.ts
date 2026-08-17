import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SCHEDULE_OVERRIDE_PICK_ORDER,
  SCHEDULE_OVERRIDE_RANGE_ORDER,
} from "@/lib/schedule/override-order";

/**
 * LOGIC-11 — дублирующиеся `ScheduleOverride` читаются всеми одинаково.
 *
 * На `(providerId, date)` уникальности нет, а писатели делают check-then-insert
 * без транзакции: два параллельных автосейва (debounce 500 мс) создают по
 * строке. Дальше потребители расходились дважды — читали без `orderBy` (какую
 * строку вернёт планировщик, не определено) И выбирали по-разному: движок берёт
 * ПЕРВОЕ совпадение по дате, а генератор слотов складывал строки в `Map`, то
 * есть побеждала ПОСЛЕДНЯЯ. Итог: guard рабочих часов мог разрешить перенос,
 * которого генератор слотов не предлагал.
 *
 * Ноль дубликатов этим не достигается — это `@@unique` + дедуп, решение
 * владельца (см. BLOCKED). Здесь пиннится, что при дублях поведение
 * ДЕТЕРМИНИРОВАНО и одинаково у всех.
 */

describe("канон выбора строки", () => {
  it("свежая правка важнее, тай-брейк тотальный", () => {
    // `updatedAt` двух строк, созданных в одну миллисекунду, совпадает —
    // без второго ключа порядок снова стал бы произвольным.
    expect(SCHEDULE_OVERRIDE_PICK_ORDER).toEqual([{ updatedAt: "desc" }, { id: "desc" }]);
  });

  it("для диапазона дата идёт первой, канон — следом", () => {
    expect(SCHEDULE_OVERRIDE_RANGE_ORDER).toEqual([
      { date: "asc" },
      { updatedAt: "desc" },
      { id: "desc" },
    ]);
  });
});

const SRC = join(process.cwd(), "src");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");

describe("LOGIC-11 · все, кто выбирает ОДНУ строку на дату, берут канон", () => {
  it.each([
    ["lib/schedule/master-work-window.ts", "guard рабочих часов"],
    ["lib/schedule/editor.ts", "писатель исключения"],
    ["lib/schedule/usecases.ts", "писатель дня"],
    ["lib/schedule/unified.ts", "unified-путь"],
  ])("%s (%s)", (file) => {
    const source = read(file);
    expect(source).toContain("SCHEDULE_OVERRIDE_PICK_ORDER");
    // Каждый `findFirst` по overrides обязан нести порядок — иначе новый
    // читатель молча вернётся к произвольной строке.
    const calls = [...source.matchAll(/scheduleOverride\.findFirst\(\{/g)];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const block = source.slice(call.index!, call.index! + 300);
      expect(block).toContain("orderBy: SCHEDULE_OVERRIDE_PICK_ORDER");
    }
  });

  it.each([
    ["lib/schedule/engine-context.ts", "движок"],
    ["lib/schedule/bookable-window.ts", "генератор слотов"],
  ])("%s (%s) берёт канон для диапазона", (file) => {
    expect(read(file)).toContain("SCHEDULE_OVERRIDE_RANGE_ORDER");
  });

  it("генератор слотов выбирает ПЕРВУЮ строку, как движок (был безусловный set)", () => {
    const source = read("lib/schedule/bookable-window.ts");
    expect(source).toContain("if (exceptionsByDate.has(dateKey)) continue;");
    // Порядок важен: guard должен стоять ДО записи в Map.
    expect(source.indexOf("if (exceptionsByDate.has(dateKey)) continue;")).toBeLessThan(
      source.indexOf("exceptionsByDate.set(dateKey"),
    );
  });

  it("движок по-прежнему берёт первое совпадение — канон опирается на это", () => {
    const source = read("lib/schedule/rule-engine.ts");
    // Если правило выбора здесь поменяют на «последнее», канон разъедется с
    // генератором слотов, и находка вернётся с другой стороны.
    expect(source).toMatch(/for \(const item of overrides\) \{[\s\S]*?return item;/);
  });
});
