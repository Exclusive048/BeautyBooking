import { describe, expect, it } from "vitest";
import { isValidDateKey, monthCells, mondayOf, shiftMonthKey, weekdayMondayFirst } from "./month-grid";

describe("month-grid", () => {
  it("понедельник недели — по ключу даты, без пояса", () => {
    expect(weekdayMondayFirst("2026-10-26")).toBe(0);
    expect(weekdayMondayFirst("2026-11-01")).toBe(6);
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(mondayOf("2026-10-26")).toBe("2026-10-26");
  });

  it("месяц сдвигается через границу года в обе стороны", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
    expect(shiftMonthKey("2026-10", 14)).toBe("2027-12");
  });

  it("сетка месяца начинается с понедельника и кратна неделе", () => {
    const cells = monthCells("2026-10");
    // 1 октября 2026 — четверг: три пустые клетки перед ним.
    expect(cells.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(cells.length % 7).toBe(0);
    expect(cells.filter(Boolean)).toHaveLength(31);
  });

  it("isValidDateKey отбрасывает несуществующие даты", () => {
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-13-01")).toBe(false);
    expect(isValidDateKey(null)).toBe(false);
  });
});
