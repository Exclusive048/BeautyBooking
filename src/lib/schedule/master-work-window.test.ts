import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-SUNDAY-01 — воскресенье ищется в недельном расписании как 7.
 *
 * @probe 2026-09-22 — в запросе `weekday: toScheduleWeekday(weekday)` заменён
 * обратно на `weekday`: красным стал «рабочее воскресенье мастера — рабочий
 * день» (резолвер вернул дефолт `isActive: false`). Возвращён — зелёный.
 */

const mocks = vi.hoisted(() => ({
  weeklyFindFirst: vi.fn(),
  overrideFindFirst: vi.fn(async () => null),
  providerFindUnique: vi.fn(async () => ({ timezone: "Asia/Yekaterinburg" })),
  getDayPlan: vi.fn(async () => ({ isWorking: true, workingIntervals: [], breaks: [] as Array<{ start: string; end: string }> })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scheduleOverride: { findFirst: mocks.overrideFindFirst },
    weeklyScheduleDay: { findFirst: mocks.weeklyFindFirst },
    provider: { findUnique: mocks.providerFindUnique },
  },
}));
vi.mock("@/lib/schedule/engine", () => ({ ScheduleEngine: { getDayPlan: mocks.getDayPlan } }));

import { resolveMasterWorkWindow, toScheduleWeekday } from "@/lib/schedule/master-work-window";
import { assertWithinMasterWorkHours } from "@/lib/bookings/policy-enforcement";

beforeEach(() => {
  mocks.weeklyFindFirst.mockReset();
  mocks.getDayPlan.mockClear();
});

describe("SCHEDULE-SUNDAY-01", () => {
  it("JS-воскресенье (0) переводится в 7, остальные дни — как есть", () => {
    expect(toScheduleWeekday(0)).toBe(7);
    expect(toScheduleWeekday(1)).toBe(1);
    expect(toScheduleWeekday(6)).toBe(6);
  });

  it("рабочее воскресенье мастера — рабочий день", async () => {
    mocks.weeklyFindFirst.mockImplementation(async (args: { where: { weekday: number } }) =>
      args.where.weekday === 7
        ? { isActive: true, template: { startLocal: "11:00", endLocal: "18:00" } }
        : null
    );

    const window = await resolveMasterWorkWindow("master-1", 0, "2026-09-27");

    expect(window).toEqual({ isActive: true, startMinutes: 11 * 60, endMinutes: 18 * 60 });
  });
});

/**
 * BOOKING-FLOW-AUDIT-RESIDUALS — guard рабочих часов видит перерывы дня: те же,
 * что движок вырезает из окошек. Раньше запись из кабинета студии и перенос
 * ложились поверх обеда мастера.
 *
 * @probe 2026-09-24 — в `assertWithinMasterWorkHours` убрана проверка
 * `onBreak`: красный «запись на обед отклоняется». Возвращено — зелёный.
 * @probe 2026-09-24 — `resolveDayBreaks` не подмешан в окно (`breaks` не
 * возвращается): красный «перерывы дня — из DayPlan движка».
 */
describe("перерывы в окне рабочего дня", () => {
  it("перерывы дня — из DayPlan движка", async () => {
    mocks.weeklyFindFirst.mockResolvedValue({ isActive: true, template: { startLocal: "10:00", endLocal: "19:00" } });
    mocks.getDayPlan.mockResolvedValueOnce({
      isWorking: true,
      workingIntervals: [],
      breaks: [{ start: "13:00", end: "14:00" }],
    });

    const window = await resolveMasterWorkWindow("master-1", 3, "2026-09-30");

    expect(window.breaks).toEqual([{ startMinutes: 13 * 60, endMinutes: 14 * 60 }]);
    expect(mocks.getDayPlan).toHaveBeenCalledWith({
      masterId: "master-1",
      date: "2026-09-30",
      timezone: "Asia/Yekaterinburg",
    });
  });

  it("запись на обед отклоняется, встык к нему — проходит", () => {
    const window = { isActive: true, startMinutes: 600, endMinutes: 1140, breaks: [{ startMinutes: 780, endMinutes: 840 }] };
    expect(() =>
      assertWithinMasterWorkHours({ bookingStartMinutes: 750, bookingEndMinutes: 810, window }),
    ).toThrow("Выбранное время попадает на перерыв мастера.");
    expect(() =>
      assertWithinMasterWorkHours({ bookingStartMinutes: 720, bookingEndMinutes: 780, window }),
    ).not.toThrow();
    expect(() =>
      assertWithinMasterWorkHours({ bookingStartMinutes: 840, bookingEndMinutes: 900, window }),
    ).not.toThrow();
  });
});
