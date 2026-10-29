import { describe, expect, it } from "vitest";
import type { CalendarDayDto } from "@/lib/schedule/calendar-shared";
import { addDaysToDateKey } from "@/lib/schedule/dateKey";
import { applyPaintOptimistic, bookingsOnDaysOff, buildMonthGrids, compactHour } from "./calendar-grid";

function day(date: string, patch: Partial<CalendarDayDto> = {}): CalendarDayDto {
  return {
    date,
    past: false,
    beyond: false,
    isWorking: false,
    start: null,
    end: null,
    breaks: [],
    fixed: false,
    templateId: null,
    painted: false,
    bookings: 0,
    ...patch,
  };
}

describe("buildMonthGrids", () => {
  it("месяц начинается с нужного дня недели и добивается до полных недель", () => {
    // 1 октября 2026 — четверг: три пустые клетки (Пн, Вт, Ср).
    const days = Array.from({ length: 31 }, (_, index) => day(addDaysToDateKey("2026-10-01", index)));
    const [october] = buildMonthGrids(days);
    expect(october.key).toBe("2026-10");
    expect(october.cells.slice(0, 3)).toEqual([null, null, null]);
    expect(october.cells[3]?.date).toBe("2026-10-01");
    expect(october.cells.length % 7).toBe(0);
  });

  it("дни нескольких месяцев раскладываются по месяцам", () => {
    const days = Array.from({ length: 62 }, (_, index) => day(addDaysToDateKey("2026-10-01", index)));
    expect(buildMonthGrids(days).map((grid) => grid.key)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });
});

describe("applyPaintOptimistic", () => {
  it("кисть рабочего дня ставит его часы, перерывы и отметку «изменён»", () => {
    const next = applyPaintOptimistic(
      day("2026-10-05", { isWorking: true, start: "10:00", end: "20:00", breaks: [{ start: "14:00", end: "15:00" }] }),
      { kind: "template", templateId: "t1" },
      {
        startTime: "09:00",
        endTime: "15:00",
        fixed: false,
        breaks: [
          { start: "12:00", end: "12:30" },
          { start: "10:30", end: "10:45" },
        ],
      },
    );
    expect(next).toMatchObject({
      isWorking: true,
      templateId: "t1",
      start: "09:00",
      end: "15:00",
      breaks: [
        { start: "10:30", end: "10:45" },
        { start: "12:00", end: "12:30" },
      ],
      painted: true,
    });
  });

  it("свои часы дня — ровно его перерывы, без перерывов прежнего дня", () => {
    const next = applyPaintOptimistic(
      day("2026-10-05", { isWorking: true, start: "10:00", end: "20:00", breaks: [{ start: "14:00", end: "15:00" }] }),
      { kind: "hours", startTime: "11:00", endTime: "19:00", breaks: [] },
      null,
    );
    expect(next).toMatchObject({ start: "11:00", end: "19:00", breaks: [] });
  });

  it("выходной снимает часы", () => {
    const next = applyPaintOptimistic(
      day("2026-10-05", { isWorking: true, start: "10:00", end: "20:00", templateId: "t1" }),
      { kind: "off" },
      null,
    );
    expect(next).toMatchObject({ isWorking: false, templateId: null, start: null, breaks: [], painted: true });
  });

  it("«как по графику» — каким станет день, знает только сервер: меняется лишь отметка", () => {
    const before = day("2026-10-05", { isWorking: true, start: "10:00", end: "20:00", painted: true });
    expect(applyPaintOptimistic(before, { kind: "reset" }, null)).toEqual({ ...before, painted: false });
  });
});

describe("подписи и записи", () => {
  it("часы в клетке — коротко", () => {
    expect(compactHour("09:00")).toBe("9");
    expect(compactHour("09:30")).toBe("9:30");
    expect(compactHour(null)).toBe("");
  });

  it("записи на днях, ставших выходными, считаются только по отмеченным датам", () => {
    const days = [
      day("2026-10-05", { bookings: 2 }),
      day("2026-10-06", { bookings: 1, isWorking: true }),
      day("2026-10-07", { bookings: 3 }),
    ];
    expect(bookingsOnDaysOff(days, new Set(["2026-10-05", "2026-10-06"]))).toBe(2);
  });
});
