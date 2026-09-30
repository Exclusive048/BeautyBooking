import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { canCancelIndividually } from "@/lib/bookings/flow";
import { stripComments } from "@/lib/testing/source-scan";

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
 * Предикат закрыт значением (ниже). Вторую половину снял сам предмет: с
 * SCHEDULE-PATTERNS-01 выходной записи не отменяет вовсе (второй `describe`).
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

/**
 * SCHEDULE-PATTERNS-01 (этап 3, решение владельца 2026-09-28): записи на днях,
 * ставших выходными, ОСТАЮТСЯ — перенос и отмена на совести мастера. Путь
 * записи расписания больше не отменяет брони вовсе: ни принудительного шага
 * «подтвердите отмену» (409 `SCHEDULE_DAY_OFF_CONFLICT`), ни отмен внутри
 * транзакции. Предикат `canCancelIndividually` (выше) остаётся — им судят
 * отмену на поверхностях записи.
 *
 * @probe 2026-09-28: в роут возвращён импорт `cancelBookingInTx` и его вызов в
 *        транзакции расписания → «роут расписания записи не отменяет» красный.
 */
describe("выходной в расписании записи не отменяет (SCHEDULE-PATTERNS-01)", () => {
  const source = stripComments(readFileSync(ROUTE_PATH, "utf8"));

  it("роут расписания записи не отменяет", () => {
    expect(source).not.toMatch(/cancelBooking(InTx)?\s*\(/);
    expect(source).not.toMatch(/runCancelBookingSideEffects|notifyCancelledByMaster/);
  });

  it("принудительного шага «подтвердите отмену записей» нет", () => {
    expect(source).not.toMatch(/SCHEDULE_DAY_OFF_CONFLICT/);
    expect(source).not.toMatch(/dayOffConflictResolution/);
  });

  it("снапшот по-прежнему пишется одной транзакцией (LOGIC-12)", () => {
    expect(source).not.toMatch(/[^a-zA-Z]applyScheduleSnapshot\s*\(/);
    expect(source).toMatch(/applyScheduleSnapshotTx\s*\(\s*tx\s*,/);
  });
});
