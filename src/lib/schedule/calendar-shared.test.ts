import { describe, expect, it } from "vitest";
import {
  SCHEDULE_ENDING_NOTICE_DAYS,
  isScheduleEndingSoon,
  paletteColorKey,
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

describe("paletteColorKey", () => {
  it("сохранённый ключ — как есть, иначе по порядку по кругу", () => {
    expect(paletteColorKey("4", 0)).toBe("4");
    expect(paletteColorKey(null, 0)).toBe("1");
    expect(paletteColorKey("#7c3aed", 7)).toBe("2");
  });
});
