import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
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
 * SCHEDULE-PATTERNS-01 (этап 1, 2026-09-28) довёл это до конца: дедуп по
 * этому же канону + `@@unique([providerId, date])` (миграция
 * `20260928120000_schedule_override_unique_date`), писатели — upsert по ключу.
 * Канон порядка остаётся у читателей как страховка: он ничего не стоит и
 * сохраняет детерминизм, если уникальность когда-нибудь снимут.
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

describe("SCHEDULE-PATTERNS-01 · строка на дату одна", () => {
  it("схема держит уникальность (профиль, дата)", () => {
    const schema = readFileSync(join(process.cwd(), "prisma/schema/schedule.prisma"), "utf8");
    const model = schema.slice(schema.indexOf("model ScheduleOverride {"));
    const body = model.slice(0, model.search(/\r?\n\}/));
    expect(body).toMatch(/@@unique\(\[providerId, date\]\)/);
  });

  // @probe 2026-09-28: временный `lib/schedule/__probe_override.ts` с
  // `prisma.scheduleOverride.create({ data: {} })` — красное:
  // «expected [ 'lib/schedule/__probe_override.ts' ] to deeply equal []».
  it("никто в src/ не создаёт строку мимо upsert по ключу даты", () => {
    // Набор выводится из дерева: любой новый `scheduleOverride.create(` —
    // то есть «найти, потом создать» — упадёт здесь, а не на P2002 в проде.
    // Единственное исключение — копия исключений в НОВЫЙ профиль (дублей
    // в источнике нет по той же уникальности).
    const allowed = new Set(["lib/studios/master-profile-split.ts"]);
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        const source = read(rel);
        if (/scheduleOverride\.create(Many)?\(/.test(source) && !allowed.has(rel)) {
          offenders.push(rel);
        }
      }
    };
    for (const root of ["app", "lib", "features"]) walk(root);
    expect(offenders).toEqual([]);
  });
});

describe("LOGIC-11 · все, кто выбирает ОДНУ строку на дату, берут канон", () => {
  it.each([["lib/schedule/master-work-window.ts", "guard рабочих часов"]])("%s (%s)", (file) => {
    // SCHEDULE-PATTERNS-01: guard рабочих часов берёт день из движка и строку
    // сам больше не выбирает — прямого чтения таблиц в нём нет вовсе.
    expect(read(file)).not.toMatch(/scheduleOverride|weeklyScheduleDay/);
  });

  it("каждый `findFirst` по «Особым дням» в дереве несёт канон порядка", () => {
    // Строка на дату теперь одна по схеме, но канон ничего не стоит и держит
    // детерминизм, если уникальность снимут. Набор выводится из дерева.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(SRC, dir), { withFileTypes: true })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) {
          walk(rel);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        const source = read(rel);
        for (const call of source.matchAll(/scheduleOverride\.findFirst\(\{/g)) {
          const block = source.slice(call.index!, call.index! + 300);
          if (!block.includes("orderBy: SCHEDULE_OVERRIDE_PICK_ORDER")) offenders.push(rel);
        }
      }
    };
    for (const root of ["app", "lib", "features"]) walk(root);
    expect(offenders).toEqual([]);
  });

  it.each([["lib/schedule/engine-context.ts", "движок"]])(
    "%s (%s) берёт канон для диапазона",
    (file) => {
      expect(read(file)).toContain("SCHEDULE_OVERRIDE_RANGE_ORDER");
    },
  );

  it("окно записи больше не держит своей копии правил дня (SCHEDULE-PATTERNS-01)", () => {
    // Раньше `bookable-window.ts` сам читал неделю и исключения ради режима
    // «Фиксированное время» и выбирал строку на дату по-своему (LOGIC-11 чинил
    // именно это расхождение). Режим переехал в `DayPlan` движка — второго
    // читателя, способного выбрать не ту строку, не осталось.
    const source = read("lib/schedule/bookable-window.ts");
    expect(source).not.toMatch(/scheduleOverride|weeklyScheduleConfig|weeklyScheduleDay/);
  });

  it("движок по-прежнему берёт первое совпадение — канон опирается на это", () => {
    const source = read("lib/schedule/rule-engine.ts");
    // Если правило выбора здесь поменяют на «последнее», канон разъедется с
    // генератором слотов, и находка вернётся с другой стороны.
    expect(source).toMatch(/for \(const item of overrides\) \{[\s\S]*?return item;/);
  });
});
