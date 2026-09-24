import { describe, expect, it } from "vitest";
import {
  DEFAULT_GRID_WINDOW,
  gridHeightPx,
  iterateSlotMinutes,
  offsetPxFromMinute,
  resolveGridWindow,
  SLOT_HEIGHT_PX,
} from "./time-grid";

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS — сетка дня календаря студии больше не зашита
 * на 09–21: окно раздвигается под часы мастеров и записи дня, 09–21 остаётся
 * минимумом.
 *
 * @probe 2026-09-24 — в `resolveGridWindow` цикл по минутам удалён (окно всегда
 * по умолчанию): красные три кейса — «мастер с 08:00…», «запись до 22:30…»
 * и «интервал на весь день…».
 */
describe("окно сетки дня студии", () => {
  it("без данных — 09–21", () => {
    expect(resolveGridWindow([])).toEqual({ startHour: 9, endHour: 21 });
  });

  it("мастер с 08:00 — сетка начинается в 08:00", () => {
    expect(resolveGridWindow([8 * 60, 19 * 60])).toEqual({ startHour: 8, endHour: 21 });
  });

  it("запись до 22:30 — сетка до 23:00", () => {
    expect(resolveGridWindow([20 * 60, 22 * 60 + 30])).toEqual({ startHour: 9, endHour: 23 });
  });

  it("интервал на весь день не выходит за сутки", () => {
    expect(resolveGridWindow([0, 24 * 60])).toEqual({ startHour: 0, endHour: 24 });
  });

  it("позиция и высота считаются от окна", () => {
    const window = { startHour: 8, endHour: 22 };
    expect(offsetPxFromMinute(8 * 60, window)).toBe(0);
    expect(offsetPxFromMinute(9 * 60, window)).toBe(2 * SLOT_HEIGHT_PX);
    expect(gridHeightPx(window)).toBe(28 * SLOT_HEIGHT_PX);
    expect(Array.from(iterateSlotMinutes(window))[0]).toBe(8 * 60);
    // значения по умолчанию — прежние 09–21
    expect(offsetPxFromMinute(9 * 60)).toBe(0);
    expect(gridHeightPx()).toBe(gridHeightPx(DEFAULT_GRID_WINDOW));
  });
});
