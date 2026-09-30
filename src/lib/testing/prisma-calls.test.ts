import { describe, expect, it } from "vitest";
import { bookingStatusWrite, conflictScopeOf, windowBuilderNames } from "./booking-guards";
import { parseSource, scanPrismaCalls } from "./prisma-calls";

/**
 * 29.09 доработки · 14 — машинерия общего AST-разборщика (`prisma-calls.ts`) и
 * правил сторожей записи броней (`booking-guards.ts`) на фикстурах: на каждый
 * признак — положительный и отрицательный вход, плюс формы, на которых сгорели
 * прежние регекспы (хвостовой комментарий, аргумент собран заранее, `?:`,
 * делегат в переменной). GUARD-INTEGRITY правила 2 и 6.
 */

function sites(src: string) {
  return scanPrismaCalls("fixture.ts", src, "booking");
}

function statusOf(src: string): string[] {
  return sites(src).calls.map((s) => bookingStatusWrite(s) ?? "-");
}

describe("scanPrismaCalls", () => {
  it("находит вызов делегата и метод", () => {
    const { calls } = sites("await tx.booking.updateMany({ where: { id }, data: { note: 1 } });");
    expect(calls.map((c) => c.method)).toEqual(["updateMany"]);
  });

  it("данные брони (`row.booking.startAtUtc`) — не вызов делегата и не непроверяемый сайт", () => {
    const parsed = sites("const t = row.booking.startAtUtc.toISOString(); const b = row.booking;");
    expect(parsed.calls).toEqual([]);
    expect(parsed.uncheckable).toEqual([]);
  });

  it("делегат в переменной с вызовом метода — непроверяемый сайт", () => {
    const parsed = sites("const b = tx.booking;\nawait b.updateMany({ where: {}, data: { status: 'X' } });");
    expect(parsed.uncheckable.map((u) => u.reason)).toEqual(["делегат в переменной «b» (.updateMany)"]);
  });

  it('`tx["booking"]` — непроверяемый сайт', () => {
    const parsed = sites('await tx["booking"].update({ where: { id }, data: {} });');
    expect(parsed.uncheckable).toHaveLength(1);
  });

  it("ведущий комментарий инструкции — отметка; хвостовой не глотает код", () => {
    const parsed = sites(
      "// booking-status-write-ok: причина\nawait tx.booking.update({ where: { id }, data: { status } }); // хвост\n",
    );
    expect(parsed.calls[0].marks).toEqual(["booking-status-write-ok: причина"]);
    expect(bookingStatusWrite(parsed.calls[0])).toBe("status");
  });
});

describe("bookingStatusWrite", () => {
  it("прямой `status` в data", () => {
    expect(statusOf("tx.booking.update({ where: { id }, data: { status: 'CONFIRMED' } });")).toEqual(["status"]);
  });

  it("`status` в одной ветке `?:` data", () => {
    expect(
      statusOf("const data = flag ? { a: 1 } : { status: 'X' };\ntx.booking.updateMany({ where: {}, data });"),
    ).toEqual(["status"]);
  });

  it("обе ветки `?:` без status — чисто (контроль reminders.ts)", () => {
    expect(
      statusOf("const data = flag ? { a: 1 } : { b: 2 };\ntx.booking.updateMany({ where: {}, data });"),
    ).toEqual(["clean"]);
  });

  it("аргумент собран заранее", () => {
    expect(
      statusOf("const args = { where: { id }, data: { status: 'X' } };\ntx.booking.updateMany(args);"),
    ).toEqual(["status"]);
  });

  it("спред литерала в data разворачивается", () => {
    expect(statusOf("const base = { status: 'X' };\ntx.booking.update({ where: {}, data: { ...base } });")).toEqual([
      "status",
    ]);
  });

  it("неразрешимая data (параметр, вызов) — unresolved", () => {
    const [v] = statusOf("function f(data: unknown) { return tx.booking.update({ where: {}, data }); }");
    expect(v).toMatch(/^unresolved/);
    expect(statusOf("tx.booking.update({ where: {}, data: build() });")[0]).toMatch(/^unresolved/);
  });

  it("upsert: смотрятся и update, и create", () => {
    expect(
      statusOf("tx.booking.upsert({ where: {}, update: { a: 1 }, create: { status: 'X' } });"),
    ).toEqual(["status"]);
  });

  it("чтение — не запись", () => {
    expect(statusOf("tx.booking.findMany({ where: { status: 'X' } });")).toEqual(["-"]);
  });
});

describe("conflictScopeOf", () => {
  const BUILDERS = new Set(["buildConflictWindowWhere", "buildBookingOverlapWhere"]);

  function scopeOf(src: string): Array<string | null> {
    return sites(src).calls.map((s) => conflictScopeOf(s, BUILDERS));
  }

  it("окно через билдер + скоуп через билдер", () => {
    expect(
      scopeOf("tx.booking.findMany({ where: { ...buildConflictScopeWhere(x), ...buildConflictWindowWhere(w) } });"),
    ).toEqual(["scope:buildConflictScopeWhere"]);
  });

  it("окно парой lt/gt без скоупа — MISSING (статус через константу семью не меняет)", () => {
    expect(
      scopeOf(
        "tx.booking.findMany({ where: { providerId, masterProviderId, status: { in: ACTIVE }, startAtUtc: { lt: e }, endAtUtc: { gt: s } } });",
      ),
    ).toEqual(["MISSING"]);
  });

  it("скоуп через константу из той же функции", () => {
    expect(
      scopeOf(
        "function f() { const occ = buildOccupancyBookingWhere(ids);\n return tx.booking.count({ where: { ...occ, ...buildBookingOverlapWhere(a, b) } }); }",
      ),
    ).toEqual(["scope:buildOccupancyBookingWhere"]);
  });

  it("отметка на инструкции", () => {
    expect(
      scopeOf("// conflict-scope-ok: соседи по пакету\nconst x = await tx.booking.findFirst({ where: { startAtUtc: { lt: e }, endAtUtc: { gt: s } } });"),
    ).toEqual(["mark"]);
  });

  it("чтение без окна пересечения — не семья", () => {
    expect(scopeOf("tx.booking.findMany({ where: { startAtUtc: { gte: a, lt: b } } });")).toEqual([null]);
  });

  it("строители окна выводятся по свойству", () => {
    const sf = parseSource(
      "w.ts",
      "export function a(x: Date, y: Date) { return { startAtUtc: { not: null, lt: y }, endAtUtc: { gt: x } }; }\n" +
        "export const b = (x: Date) => ({ startAtUtc: { gte: x } });\n",
    );
    expect([...windowBuilderNames([sf])]).toEqual(["a"]);
  });
});
