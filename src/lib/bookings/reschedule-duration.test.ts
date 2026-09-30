import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * LOGIC-03 — при переносе клиент полностью контролировал длительность брони.
 *
 * Схема (`validation/bookings.ts`) валидировала только «конец позже начала», а
 * `rescheduleBooking` не звал `resolveBookingCore` — то есть ни длительность
 * услуги, ни рабочие часы не пересчитывались, и `confirmBooking` применял
 * присланные значения дословно. Две стороны одного дефекта:
 *
 *   сжатие  — `end = start + 5 мин` для 90-минутной услуги: бронь пролезает в
 *             щель между чужими, мастер видит в диалоге только время НАЧАЛА и
 *             подтверждает; реальная услуга накрывает следующего клиента;
 *   раздувание — `08:00–23:59`: после подтверждения день мастера закрыт целиком.
 *
 * На create-пути такая подмена невозможна — там диапазон обязан совпасть со
 * слотом байт в байт (`booking-core.ts`), и именно эта асимметрия была дырой.
 *
 * Проверять это end-to-end значило бы поднимать Prisma; вместо этого пиннится
 * то, что дефект и составляло: путь переноса **не использует** присланный
 * `endAtUtc`, выводит длительность из снапшотов и проверяет рабочие часы тем же
 * guard'ом, что студийный move.
 */

const PROJECT_ROOT = resolve(__dirname, "..", "..", "..");
const source = readFileSync(resolve(PROJECT_ROOT, "src/lib/bookings/usecases.ts"), "utf8");

/** Тело `rescheduleBooking` — чтобы не ловить совпадения из соседних функций. */
function rescheduleBody(): string {
  const start = source.indexOf("export async function rescheduleBooking");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("LOGIC-03 · перенос не доверяет клиентской длительности", () => {
  const body = rescheduleBody();

  it("присланный `endAtUtc` не доезжает ни до записи, ни до проверок", () => {
    // именно это и было дырой: значение попадало в `proposedEndAt` дословно.
    // Остаётся ровно одна ссылка — проверка «запрос сформирован корректно».
    const uses = body.match(/input\.endAtUtc/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(body).toContain("if (!isValidDate(input.startAtUtc) || !isValidDate(input.endAtUtc))");
  });

  it("длительность выводится из снапшотов `durationSnapshotMin`", () => {
    expect(body).toContain("durationSnapshotMin");
    expect(body).toContain("const endAtUtc = new Date(input.startAtUtc.getTime()");
  });

  it("в `proposedEndAt` пишется выведенное значение", () => {
    expect(body).toContain("proposedEndAt: endAtUtc");
  });

  it("проверка пересечений идёт по выведенному окну, а не по присланному", () => {
    const conflictCall = body.slice(body.indexOf("ensureRescheduleTimeFree("));
    expect(conflictCall).toContain("endAtUtc");
    expect(conflictCall.slice(0, 300)).not.toContain("input.endAtUtc");
  });

  it("рабочие часы проверяются тем же guard'ом, что у студийного move", () => {
    // именно ВЫЗОВ с выведенной длительностью, а не просто упоминание символа
    expect(body).toMatch(
      /assertWithinMasterWorkHours\(\{[\s\S]{0,240}bookingEndMinutes:[\s\S]{0,80}durationMin/,
    );
    expect(body).toMatch(/const workWindow = await resolveMasterWorkWindow\(/);
  });

  it("окно считается в salon-tz, а не на UTC-инстанте", () => {
    // `getUTCHours()` на реальном инстанте сдвинул бы окно на оффсет салона
    expect(body).toContain("resolveSalonLocalParts");
    expect(body).not.toContain("getUTCHours");
  });
});

/**
 * Резолвер рабочего окна вынесен в общий модуль: копий быть не должно — он
 * знает нетривиальный факт про хранение `ScheduleOverride.date`, и разошедшиеся
 * копии дали бы разные ответы на одном расписании.
 */
describe("LOGIC-03 · резолвер рабочего окна — один", () => {
  it("студийный move и перенос берут его из общего модуля", () => {
    for (const rel of ["src/lib/studio/bookings.service.ts", "src/lib/bookings/usecases.ts"]) {
      const text = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(text, rel).toContain('from "@/lib/schedule/master-work-window"');
    }
  });

  it("собственного определения резолвера в вызывающих не осталось", () => {
    for (const rel of ["src/lib/studio/bookings.service.ts", "src/lib/bookings/usecases.ts"]) {
      const text = readFileSync(resolve(PROJECT_ROOT, rel), "utf8");
      expect(text, rel).not.toContain("async function resolveMasterWorkWindow");
    }
  });
});
