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
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    scheduleOverride: { findFirst: mocks.overrideFindFirst },
    weeklyScheduleDay: { findFirst: mocks.weeklyFindFirst },
  },
}));

import { resolveMasterWorkWindow, toScheduleWeekday } from "@/lib/schedule/master-work-window";

beforeEach(() => {
  mocks.weeklyFindFirst.mockReset();
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
