import { describe, expect, it } from "vitest";
import { buildStudioWeekCell } from "./week-capacity";

/**
 * MOBILE-STUDIO-C (ops) — загрузка недели студии по настоящему графику:
 * выходные, ёмкость в минутах и дни «Фиксированное время».
 */

const base = {
  date: "2026-10-05",
  active: true,
  isWorking: true,
  workMinutes: 480,
  fixedStartsCount: null,
  booked: 0,
  bookedMinutes: 0,
};

describe("buildStudioWeekCell", () => {
  it("рабочий день: загрузка — доля занятых минут", () => {
    expect(buildStudioWeekCell({ ...base, booked: 3, bookedMinutes: 210 })).toEqual({
      date: "2026-10-05",
      isDayOff: false,
      booked: 3,
      bookedMinutes: 210,
      capacityMinutes: 480,
      fixedSlots: null,
      percent: 44,
    });
  });

  it("выходной по графику: ёмкость 0, загрузка 0, записи всё равно видны", () => {
    expect(buildStudioWeekCell({ ...base, isWorking: false, workMinutes: 0, booked: 1, bookedMinutes: 60 })).toMatchObject({
      isDayOff: true,
      booked: 1,
      capacityMinutes: 0,
      fixedSlots: null,
      percent: 0,
    });
  });

  it("неактивный мастер — выходной, даже если план рабочий", () => {
    expect(buildStudioWeekCell({ ...base, active: false })).toMatchObject({ isDayOff: true, capacityMinutes: 0 });
  });

  it("нет плана — выходной", () => {
    expect(buildStudioWeekCell({ ...base, isWorking: undefined })).toMatchObject({ isDayOff: true });
  });

  it("фиксированное время: загрузка — доля занятых начал, ёмкость в минутах null", () => {
    expect(
      buildStudioWeekCell({ ...base, workMinutes: null, fixedStartsCount: 4, booked: 1, bookedMinutes: 90 }),
    ).toMatchObject({ isDayOff: false, capacityMinutes: null, fixedSlots: 4, percent: 25 });
  });

  it("перебор — не больше 100%", () => {
    expect(buildStudioWeekCell({ ...base, workMinutes: 60, booked: 2, bookedMinutes: 120 }).percent).toBe(100);
    expect(
      buildStudioWeekCell({ ...base, workMinutes: null, fixedStartsCount: 1, booked: 3, bookedMinutes: 180 }).percent,
    ).toBe(100);
  });

  it("рабочий день без минут (весь день — перерыв): загрузка 0", () => {
    expect(buildStudioWeekCell({ ...base, workMinutes: 0, booked: 1, bookedMinutes: 60 })).toMatchObject({
      isDayOff: false,
      capacityMinutes: 0,
      percent: 0,
    });
  });
});
