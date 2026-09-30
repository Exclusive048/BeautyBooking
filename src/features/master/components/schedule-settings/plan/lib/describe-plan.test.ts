import { describe, expect, it } from "vitest";
import { cycleWorkOff, previewPatternDays, summarizePattern, weekdayIndex, weekdayRanges } from "./describe-plan";

const TEMPLATE = {
  id: "t",
  name: null,
  color: "1" as const,
  startTime: "10:00",
  endTime: "20:00",
  breaks: [],
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
  inPalette: true,
  inUse: true,
};

describe("describe-plan", () => {
  it("N через M узнаётся, произвольная серия — нет", () => {
    expect(cycleWorkOff(["t", "t", null, null])).toEqual({ work: 2, off: 2 });
    expect(cycleWorkOff(["t", null, null])).toEqual({ work: 1, off: 2 });
    expect(cycleWorkOff(["t", null, "t", null])).toBeNull();
    expect(cycleWorkOff([null, "t"])).toBeNull();
  });

  it("сводка графика", () => {
    expect(
      summarizePattern(
        { kind: "CYCLE", cycleDays: 4, anchorOn: "2026-10-01", startsOn: null, endsOn: null, days: ["t", "t", null, null] },
        [TEMPLATE],
      ),
    ).toBe("2 через 2 · 10:00–20:00");
    expect(
      summarizePattern(
        {
          kind: "WEEK",
          cycleDays: 7,
          anchorOn: "2024-01-01",
          startsOn: null,
          endsOn: null,
          days: ["t", "t", "t", "t", "t", null, null],
        },
        [TEMPLATE],
      ),
    ).toBe("По дням недели: Пн–Пт · 10:00–20:00");
    // Чередование недель называет дни каждой недели.
    expect(
      summarizePattern(
        {
          kind: "WEEKS",
          cycleDays: 14,
          anchorOn: "2026-09-28",
          startsOn: null,
          endsOn: null,
          days: ["t", "t", "t", "t", null, null, null, null, null, null, "t", "t", "t", "t"],
        },
        [TEMPLATE],
      ),
    ).toBe("Недели чередуются: Пн–Чт / Чт–Вс · 10:00–20:00");
  });

  it("дни недели коротко: диапазоны от трёх дней, остальное через запятую", () => {
    expect(weekdayRanges([true, true, true, true, true, false, false])).toBe("Пн–Пт");
    expect(weekdayRanges([true, false, true, false, true, false, false])).toBe("Пн, Ср, Пт");
    expect(weekdayRanges([true, true, false, true, true, true, true])).toBe("Пн, Вт, Чт–Вс");
    expect(weekdayRanges(Array(7).fill(false))).toBe("");
  });

  it("«отмечу дни сам» — цикл из одного выходного, дни ставятся в календаре", () => {
    expect(
      summarizePattern(
        { kind: "CYCLE", cycleDays: 1, anchorOn: "2026-10-01", startsOn: null, endsOn: null, days: [null] },
        [TEMPLATE],
      ),
    ).toBe("Дни отмечаю сам");
    // Неделя без рабочих дней — это не ручной режим, а «все дни выходные».
    expect(
      summarizePattern(
        { kind: "WEEK", cycleDays: 7, anchorOn: "2024-01-01", startsOn: null, endsOn: null, days: Array(7).fill(null) },
        [TEMPLATE],
      ),
    ).not.toBe("Дни отмечаю сам");
  });

  it("разные часы у рабочих дней — «часы по дням», а не часы первого дня", () => {
    expect(
      summarizePattern(
        {
          kind: "WEEK",
          cycleDays: 7,
          anchorOn: "2024-01-01",
          startsOn: null,
          endsOn: null,
          days: ["t", "t", "t", "t", "t", "sat", null],
        },
        [TEMPLATE, { ...TEMPLATE, id: "sat", endTime: "18:00" }],
      ),
    ).toBe("По дням недели: Пн–Сб · часы по дням");
  });

  it("предпросмотр — та же формула, что у движка, и выходные после конца", () => {
    const days = previewPatternDays({
      anchorOn: "2026-10-01",
      days: ["t", "t", null, null],
      fromKey: "2026-10-01",
      count: 7,
      endsOn: "2026-10-05",
    });
    expect(days.map((day) => day.working)).toEqual([true, true, false, false, true, false, false]);
  });

  it("день недели ключа: 2026-09-28 — понедельник", () => {
    expect(weekdayIndex("2026-09-28")).toBe(0);
    expect(weekdayIndex("2026-10-04")).toBe(6);
  });
});
