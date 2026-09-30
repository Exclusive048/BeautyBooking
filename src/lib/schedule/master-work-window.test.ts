import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Guard рабочих часов берёт окно дня из `DayPlan` движка — того же, по
 * которому режутся окошки (SCHEDULE-PATTERNS-01, этап 1).
 *
 * До этого часы резолвер читал сам (неделя + исключение, с запасным
 * «Пн–Сб 10–19», которого у движка нет), а перерывы — из движка. Воскресенье
 * при этом искалось отдельным переводом дня недели (SCHEDULE-SUNDAY-01) — теперь
 * день недели и дату сводит движок, и копии перевода здесь нет.
 *
 * @probe 2026-09-28 — в `workWindowFromDayPlan` перерывы не подмешаны в окно:
 * красный «перерывы дня — из DayPlan движка». Возвращено — зелёный.
 * @probe 2026-09-24 — в `assertWithinMasterWorkHours` убрана проверка
 * `onBreak`: красный «запись на обед отклоняется». Возвращено — зелёный.
 */

const mocks = vi.hoisted(() => ({
  providerFindUnique: vi.fn(async () => ({ timezone: "Asia/Yekaterinburg" }) as { timezone: string } | null),
  getDayPlan: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { provider: { findUnique: mocks.providerFindUnique } },
}));
vi.mock("@/lib/schedule/engine", () => ({ ScheduleEngine: { getDayPlan: mocks.getDayPlan } }));

import { resolveMasterWorkWindow } from "@/lib/schedule/master-work-window";
import { assertWithinMasterWorkHours } from "@/lib/bookings/policy-enforcement";

beforeEach(() => {
  mocks.getDayPlan.mockReset();
  mocks.providerFindUnique.mockClear();
});

describe("окно рабочего дня — из DayPlan движка", () => {
  it("часы дня и дата салона", async () => {
    mocks.getDayPlan.mockResolvedValueOnce({
      isWorking: true,
      workingIntervals: [{ start: "11:00", end: "18:00" }],
      breaks: [],
      meta: { source: "weekly-template" },
    });

    const window = await resolveMasterWorkWindow("master-1", "2026-09-27");

    expect(window).toEqual({ isActive: true, startMinutes: 11 * 60, endMinutes: 18 * 60 });
    expect(mocks.getDayPlan).toHaveBeenCalledWith({
      masterId: "master-1",
      date: "2026-09-27",
      timezone: "Asia/Yekaterinburg",
    });
  });

  it("перерывы дня — из DayPlan движка", async () => {
    mocks.getDayPlan.mockResolvedValueOnce({
      isWorking: true,
      workingIntervals: [{ start: "10:00", end: "19:00" }],
      breaks: [{ start: "13:00", end: "14:00" }],
      meta: { source: "weekly-template" },
    });

    const window = await resolveMasterWorkWindow("master-1", "2026-09-30");

    expect(window.breaks).toEqual([{ startMinutes: 13 * 60, endMinutes: 14 * 60 }]);
  });

  it("выходной по движку — день закрыт (прежнего запасного «Пн–Сб 10–19» нет)", async () => {
    mocks.getDayPlan.mockResolvedValueOnce({
      isWorking: false,
      workingIntervals: [],
      breaks: [],
      meta: { source: "weekly-template" },
    });

    const window = await resolveMasterWorkWindow("master-1", "2026-09-29");

    expect(window).toEqual({ isActive: false, startMinutes: null, endMinutes: null });
  });

  it("профиля нет — день закрыт, движок не вызывается", async () => {
    mocks.providerFindUnique.mockResolvedValueOnce(null);

    const window = await resolveMasterWorkWindow("missing", "2026-09-29");

    expect(window.isActive).toBe(false);
    expect(mocks.getDayPlan).not.toHaveBeenCalled();
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
