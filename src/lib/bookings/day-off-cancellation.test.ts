import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canCancelIndividually } from "@/lib/bookings/flow";

/**
 * LOGIC-13 — «отметить день выходным» отменяло конфликтующие брони простым
 * циклом ДО записи расписания, и обе половины были дефектны:
 *
 * (1) список конфликтов судил об отменяемости ТОЛЬКО по статусу, а
 *     `cancelBooking` бросает 409 `PACKAGE_CANCEL_WHOLE` на компоненте пакета
 *     (инв. #34). День с пакетной бронью: часть броней уже отменена и
 *     клиентам ушли уведомления, потом цикл падает, выходной не проставлен;
 *
 * (2) даже без пакета отмены и запись расписания не были атомарны — любой
 *     сбой в снапшоте после последней отмены оставлял то же состояние без
 *     выхода: брони отменены, день рабочий, отката нет.
 *
 * Тест закрывает обе: предикат — значением, атомарность — формой вызова в
 * роуте (одиночная `cancelBooking` или `applyScheduleSnapshot` в этом файле
 * означают собственную транзакцию, то есть возврат дефекта).
 */

const ROUTE_PATH = resolve(process.cwd(), "src/app/api/cabinet/master/schedule/route.ts");

describe("canCancelIndividually — LOGIC-13", () => {
  it("компонент пакета не отменяется поодиночке ни в одном статусе", () => {
    for (const status of ["PENDING", "CONFIRMED", "CHANGE_REQUESTED"] as const) {
      expect(canCancelIndividually({ status, bookingPackageId: "pkg-1" })).toBe(false);
    }
  });

  it("обычная бронь отменяема в активных статусах", () => {
    for (const status of ["PENDING", "CONFIRMED", "CHANGE_REQUESTED"] as const) {
      expect(canCancelIndividually({ status, bookingPackageId: null })).toBe(true);
    }
  });

  it("отменённая, идущая и завершённая не отменяются", () => {
    for (const status of ["REJECTED", "IN_PROGRESS", "FINISHED"] as const) {
      expect(canCancelIndividually({ status, bookingPackageId: null })).toBe(false);
    }
  });
});

describe("день-выходной: отмены и запись расписания — одна транзакция (LOGIC-13)", () => {
  const source = readFileSync(ROUTE_PATH, "utf8");

  it("список конфликтов читает bookingPackageId и отдаёт его в предикат", () => {
    // Предикат может быть сколь угодно верным — если поверхность не читает
    // поле или подставляет в него константу, компонент пакета снова
    // объявляется отменяемым.
    expect(source).toMatch(/bookingPackageId:\s*true/);
    expect(source).toMatch(/bookingPackageId:\s*row\.bookingPackageId/);
  });

  it("роут не вызывает одиночную cancelBooking — только tx-форму", () => {
    // `cancelBooking(` открывает СВОЮ транзакцию и рассылает побочные эффекты
    // немедленно — то есть до того, как расписание записано.
    expect(source).not.toMatch(/[^a-zA-Z]cancelBooking\s*\(/);
    expect(source).toMatch(/cancelBookingInTx\s*\(\s*tx\s*,/);
  });

  it("роут не вызывает applyScheduleSnapshot — только tx-форму", () => {
    expect(source).not.toMatch(/[^a-zA-Z]applyScheduleSnapshot\s*\(/);
    expect(source).toMatch(/applyScheduleSnapshotTx\s*\(\s*tx\s*,/);
  });

  it("побочные эффекты отмен идут после коммита, а не внутри транзакции", () => {
    const txStart = source.indexOf("prisma.$transaction(async (tx)");
    const sideEffects = source.indexOf("runConflictCancellationSideEffects({");
    expect(txStart).toBeGreaterThan(-1);
    expect(sideEffects).toBeGreaterThan(txStart);
    // вызов побочных эффектов — вне тела транзакции: между ним и стартом
    // транзакции обязан быть её закрывающий вызов с бюджетом
    const between = source.slice(txStart, sideEffects);
    expect(between).toContain("SCHEDULE_SNAPSHOT_TX_OPTIONS)");
  });
});
