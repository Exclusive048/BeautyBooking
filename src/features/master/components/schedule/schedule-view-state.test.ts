import { describe, expect, it, vi } from "vitest";
import {
  listWeekIsos,
  parseScheduleView,
  replaceDayInUrl,
  resolveSelectedDayIso,
  shiftWeekIso,
  weekStartIsoOf,
} from "./schedule-view-state";

/**
 * PWA-UX-BATCH-01 — дневной вид расписания: один резолвер выбранного дня для
 * контролов и тела страницы. Здесь — чистые функции календарных ключей.
 */
describe("schedule-view-state", () => {
  it("listWeekIsos — семь дней от понедельника", () => {
    expect(listWeekIsos("2026-09-14")).toEqual([
      "2026-09-14",
      "2026-09-15",
      "2026-09-16",
      "2026-09-17",
      "2026-09-18",
      "2026-09-19",
      "2026-09-20",
    ]);
    expect(listWeekIsos("bad")).toEqual([]);
  });

  it("resolveSelectedDayIso — ?day= внутри недели, иначе сегодня, иначе понедельник", () => {
    expect(
      resolveSelectedDayIso({ dayParam: "2026-09-17", weekStartIso: "2026-09-14", todayIso: "2026-09-15" }),
    ).toBe("2026-09-17");
    // ?day= из другой недели — игнорируется, сегодня в этой неделе → сегодня
    expect(
      resolveSelectedDayIso({ dayParam: "2026-09-08", weekStartIso: "2026-09-14", todayIso: "2026-09-15" }),
    ).toBe("2026-09-15");
    // ни параметра, ни сегодня в неделе → понедельник
    expect(
      resolveSelectedDayIso({ dayParam: null, weekStartIso: "2026-09-21", todayIso: "2026-09-15" }),
    ).toBe("2026-09-21");
  });

  it("weekStartIsoOf / shiftWeekIso — границы недели через понедельник", () => {
    expect(weekStartIsoOf("2026-09-20")).toBe("2026-09-14");
    expect(weekStartIsoOf("2026-09-14")).toBe("2026-09-14");
    expect(shiftWeekIso("2026-09-14", 1)).toBe("2026-09-21");
    expect(shiftWeekIso("2026-09-14", -1)).toBe("2026-09-07");
  });

  it("parseScheduleView — только два вида", () => {
    expect(parseScheduleView("day")).toBe("day");
    expect(parseScheduleView("week")).toBe("week");
    expect(parseScheduleView("month")).toBeNull();
    expect(parseScheduleView(undefined)).toBeNull();
  });
});

describe("replaceDayInUrl", () => {
  /**
   * @probe Регрессия найдена живым прогоном: с `window.history.state` (у
   * записей Next есть `__NA`) патч Next считает вызов своим и НЕ синхронизирует
   * `useSearchParams` — чипы дней не переключались. Проба: вернуть
   * `window.history.state` первым аргументом — тест краснеет.
   */
  it("передаёт null состоянием — иначе Next не синхронизирует useSearchParams", () => {
    const replaceState = vi.fn();
    const fakeWindow = {
      location: { href: "http://localhost/cabinet/master/schedule?weekStart=2026-09-14" },
      history: { state: { __NA: true, tree: [] }, replaceState },
    };
    vi.stubGlobal("window", fakeWindow);
    try {
      replaceDayInUrl("2026-09-17");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(replaceState).toHaveBeenCalledTimes(1);
    const [state, , url] = replaceState.mock.calls[0]!;
    expect(state).toBeNull();
    expect(url).toBe("/cabinet/master/schedule?weekStart=2026-09-14&day=2026-09-17");
  });
});
