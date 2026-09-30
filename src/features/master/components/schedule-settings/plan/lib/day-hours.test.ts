import { describe, expect, it } from "vitest";
import { DEFAULT_DAY_HOURS, buildPatternTemplates, dayHoursToTemplate, validateDayHours } from "./day-hours";

describe("часы рабочего дня (SCHEDULE-PATTERNS-01, этап 3)", () => {
  it("одинаковые часы — один рабочий день, позиции ссылаются на него", () => {
    const weekday = { ...DEFAULT_DAY_HOURS };
    const saturday = { ...DEFAULT_DAY_HOURS, endTime: "16:00" };
    const { templates, days } = buildPatternTemplates([weekday, weekday, weekday, weekday, weekday, saturday, null]);
    expect(templates).toHaveLength(2);
    expect(days).toEqual([0, 0, 0, 0, 0, 1, null]);
    expect(templates[1]?.endTime).toBe("16:00");
  });

  it("фиксированное время — день 00:00–23:55 с отсортированными временами без повторов", () => {
    expect(dayHoursToTemplate({ ...DEFAULT_DAY_HOURS, mode: "FIXED", fixedTimes: ["16:00", "10:00", "16:00"] })).toEqual({
      startTime: "00:00",
      endTime: "23:55",
      breaks: [],
      scheduleMode: "FIXED",
      fixedSlotTimes: ["10:00", "16:00"],
    });
  });

  it("проверка: конец позже начала, перерыв внутри дня, хотя бы одно время приёма", () => {
    expect(validateDayHours(DEFAULT_DAY_HOURS)).toBeNull();
    expect(validateDayHours({ ...DEFAULT_DAY_HOURS, endTime: "09:00" })).toBe("invalidRange");
    expect(validateDayHours({ ...DEFAULT_DAY_HOURS, breakOn: true, breakStart: "09:00", breakEnd: "11:00" })).toBe(
      "invalidRange",
    );
    expect(validateDayHours({ ...DEFAULT_DAY_HOURS, mode: "FIXED", fixedTimes: [] })).toBe("noFixedTimes");
  });
});
