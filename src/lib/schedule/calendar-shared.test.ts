import { describe, expect, it } from "vitest";
import {
  SCHEDULE_ENDING_NOTICE_DAYS,
  assignPaletteColors,
  isScheduleEndingSoon,
  nextPaletteColor,
} from "@/lib/schedule/calendar-shared";

describe("isScheduleEndingSoon (SCHEDULE-PATTERNS-01, этап 3)", () => {
  it("автопродление (нет даты окончания) — не кончается", () => {
    expect(isScheduleEndingSoon({ todayKey: "2026-10-01", configuredUntil: null })).toBe(false);
  });

  it("в окне предупреждения — включая сегодня и последний день окна", () => {
    expect(isScheduleEndingSoon({ todayKey: "2026-10-01", configuredUntil: "2026-10-01" })).toBe(true);
    expect(SCHEDULE_ENDING_NOTICE_DAYS).toBe(7);
    expect(isScheduleEndingSoon({ todayKey: "2026-10-01", configuredUntil: "2026-10-08" })).toBe(true);
    expect(isScheduleEndingSoon({ todayKey: "2026-10-01", configuredUntil: "2026-10-09" })).toBe(false);
  });

  it("уже кончилось — это не «скоро», об этом говорит карточка графика", () => {
    expect(isScheduleEndingSoon({ todayKey: "2026-10-01", configuredUntil: "2026-09-30" })).toBe(false);
  });
});

describe("nextPaletteColor — новый рабочий день новым цветом", () => {
  it("первый свободный цвет, а не по числу дней в палитре", () => {
    expect(nextPaletteColor([])).toBe("1");
    // Два дня, второй — с выбранным вручную «1»: по числу дней вышел бы «3»,
    // по старому правилу индекса — снова «1» у соседа. Свободный — «2».
    expect(nextPaletteColor(["1", "3"])).toBe("2");
    expect(nextPaletteColor(["2", "1"])).toBe("3");
  });

  it("цвета кончились — самый редкий, при равенстве первый", () => {
    expect(nextPaletteColor(["1", "2", "3", "4", "5", "6"])).toBe("1");
    expect(nextPaletteColor(["1", "2", "3", "4", "5", "6", "1", "2"])).toBe("3");
  });

  it("мусор вместо ключа цвета не занимает", () => {
    expect(nextPaletteColor(["#7c3aed", null, "1"])).toBe("2");
  });
});

describe("assignPaletteColors", () => {
  it("сохранённый ключ — как есть; день палитры без ключа — свободный цвет в обход сохранённых", () => {
    expect(
      assignPaletteColors([
        { color: null, inPalette: true },
        { color: "1", inPalette: true },
        { color: null, inPalette: true },
      ]),
    ).toEqual(["2", "1", "3"]);
  });

  it("день вне палитры цвет не занимает", () => {
    expect(
      assignPaletteColors([
        { color: null, inPalette: false },
        { color: "4", inPalette: false },
        { color: null, inPalette: true },
      ]),
    ).toEqual(["1", "4", "1"]);
  });

  it("цвета не повторяются, пока их хватает", () => {
    const colors = assignPaletteColors(Array.from({ length: 6 }, () => ({ color: null, inPalette: true })));
    expect(new Set(colors).size).toBe(6);
  });
});
