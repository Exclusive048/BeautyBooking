import { describe, expect, it } from "vitest";
import { resolveDayPlanFromRule } from "@/lib/schedule/engine-core";
import { toScheduleOverrideConfigs, type TemplateInfo } from "@/lib/schedule/rule-adapters";
import type { ScheduleRuleConfig } from "@/lib/schedule/rule-engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";

/**
 * SCHEDULE-BREAKS-MANY (2026-10-29) — окошки дня совпадают с тем, что мастер
 * сохранил: перерывов сколько угодно, и у дня со своими часами — ровно его
 * перерывы.
 *
 * Жалоба владельца: часы и перерыв поменяли, а «Новая запись» показывала окошки
 * по-старому. Одна из причин — движок: у дня со «своими часами» без перерывов
 * (`TIME_RANGE` без строк `ScheduleBreak` на дату) брались перерывы ГРАФИКА.
 *
 * @probe 2026-10-29: в `getProviderWorkday` возвращено `override.breaks ??
 * base.breaks` — покраснел «свои часы без перерывов не берут обед из графика»
 * (пришёл перерыв 14:00–15:00, окошек 14:00 и 14:30 не стало).
 */

const TZ = "Europe/Moscow";
// Понедельник 2026-11-16 по салону.
const MONDAY_KEY = "2026-11-16";
const MONDAY = new Date("2026-11-15T21:00:00Z");

/** Неделя: понедельник 10:00–20:00 с обедом 14:00–15:00, остальное — выходные. */
const RULE: ScheduleRuleConfig = {
  timezone: TZ,
  periods: [
    {
      startsOn: null,
      endsOn: null,
      anchorOn: "2026-11-02",
      source: "pattern",
      days: [
        {
          isWorkday: true,
          startLocal: "10:00",
          endLocal: "20:00",
          breaks: [{ startLocal: "14:00", endLocal: "15:00" }],
          fixedStarts: null,
        },
        ...Array.from({ length: 6 }, () => ({ isWorkday: false })),
      ],
    },
  ],
};

const OVERRIDE_ROW = {
  date: MONDAY,
  isDayOff: false,
  isActive: true,
  note: null,
  reason: null,
  scheduleMode: "FLEXIBLE" as const,
  fixedSlotTimes: [],
};

function slotStarts(input: {
  overrides?: ReturnType<typeof toScheduleOverrideConfigs>;
  dateBreaks?: Array<{ startLocal: string; endLocal: string }>;
}): string[] {
  const dayPlan = resolveDayPlanFromRule({
    dateKey: MONDAY_KEY,
    rule: RULE,
    overrides: input.overrides ?? [],
    dateBreaks: input.dateBreaks ?? [],
    providerTimezone: TZ,
  });
  return buildSlotsForDay({
    dateKey: MONDAY_KEY,
    timeZone: TZ,
    dayPlan,
    bookings: [],
    serviceDurationMin: 30,
    bufferMin: 0,
    now: new Date("2026-11-01T00:00:00Z"),
    slotStepMin: 30,
  }).map((slot) => slot.label.slice(11));
}

describe("перерывы в окошках дня", () => {
  it("по графику — обед графика", () => {
    const starts = slotStarts({});
    expect(starts).toContain("13:30");
    expect(starts).not.toContain("14:00");
    expect(starts).not.toContain("14:30");
    expect(starts).toContain("15:00");
  });

  it("свои часы без перерывов не берут обед из графика", () => {
    const overrides = toScheduleOverrideConfigs(
      [{ ...OVERRIDE_ROW, kind: "TIME_RANGE", startLocal: "12:00", endLocal: "18:00", templateId: null }],
      { timezone: TZ },
    );
    const starts = slotStarts({ overrides });
    expect(starts[0]).toBe("12:00");
    expect(starts).toContain("14:00");
    expect(starts).toContain("14:30");
    expect(starts.at(-1)).toBe("17:30");
  });

  it("свои часы с несколькими перерывами — ровно эти перерывы", () => {
    const dateBreaks = [
      { startLocal: "12:30", endLocal: "13:00" },
      { startLocal: "15:00", endLocal: "15:30" },
      { startLocal: "16:30", endLocal: "17:00" },
    ];
    const overrides = toScheduleOverrideConfigs(
      [{ ...OVERRIDE_ROW, kind: "TIME_RANGE", startLocal: "12:00", endLocal: "18:00", templateId: null }],
      { timezone: TZ, breaksByDateKey: new Map([[MONDAY_KEY, dateBreaks]]) },
    );
    expect(slotStarts({ overrides, dateBreaks })).toEqual([
      "12:00",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:30",
      "16:00",
      "17:00",
      "17:30",
    ]);
  });

  it("рабочий день палитры с несколькими перерывами — все перерывы дня", () => {
    const template: TemplateInfo = {
      startLocal: "06:30",
      endLocal: "10:00",
      breaks: [
        { startLocal: "07:40", endLocal: "07:50" },
        { startLocal: "08:30", endLocal: "09:00" },
      ],
      fixedStarts: null,
    };
    const overrides = toScheduleOverrideConfigs(
      [{ ...OVERRIDE_ROW, kind: "TEMPLATE", startLocal: "06:30", endLocal: "10:00", templateId: "t-new" }],
      { timezone: TZ, templatesById: new Map([["t-new", template]]) },
    );
    // 07:30 задевает 07:40–07:50, 08:30 — внутри 08:30–09:00; 08:00 между ними свободно.
    // SLOTS-FLUSH-STARTS: 07:10 кончается ровно к первому перерыву, 07:50 — сразу после него.
    expect(slotStarts({ overrides })).toEqual(["06:30", "07:00", "07:10", "07:50", "08:00", "09:00", "09:30"]);
  });
});
