import { describe, expect, it } from "vitest";
import { fixedStartsForMode } from "@/lib/schedule/fixed-starts";
import { getProviderWorkday, type ScheduleRuleConfig } from "@/lib/schedule/rule-engine";
import { buildSlotsForDay } from "@/lib/schedule/slots";
import type { DayPlan } from "@/lib/schedule/types";

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — режим «Фиксированное время» живёт в движке.
 *
 * До этого день такого мастера хранился как 00:00–23:55, а выбранные времена
 * отсекал один фильтр `bookable-window.ts`. Ядро записи (`booking-core.ts`
 * сверяет запрос с окошками движка), горящие окошки, «свободно сегодня» и
 * фильтр каталога «когда» этого фильтра не видели — для них мастер работал
 * круглые сутки, и прямым запросом можно было записаться на 03:00.
 *
 * @probe 2026-09-28: ветку `fixedStarts ? … : buildGridStarts(…)` в
 * `buildSlotsForDay` заменили безусловной сеткой — «предлагает ровно выбранные
 * начала» и «время не по сетке» покраснели (пришли 00:00, 00:30, …).
 */

describe("fixedStartsForMode", () => {
  it("обычный день — null", () => {
    expect(fixedStartsForMode({ scheduleMode: "FLEXIBLE", fixedSlotTimes: ["10:00"] })).toBeNull();
  });

  it("фиксированный день — выбранные начала по возрастанию, без дублей и мусора", () => {
    expect(
      fixedStartsForMode({
        scheduleMode: "FIXED",
        fixedSlotTimes: ["16:00", "10:00", "10:00", "25:00", "10:03", 7],
      }),
    ).toEqual(["10:00", "16:00"]);
  });

  it("фиксированный день без времён — пустой список (окошек нет), а не обычный день", () => {
    expect(fixedStartsForMode({ scheduleMode: "FIXED", fixedSlotTimes: [] })).toEqual([]);
  });

  it("режим не записан (старое исключение) — выводится из времён, как у прежнего фильтра", () => {
    expect(fixedStartsForMode({ scheduleMode: null, fixedSlotTimes: ["13:00"] })).toEqual(["13:00"]);
    expect(fixedStartsForMode({ scheduleMode: null, fixedSlotTimes: [] })).toBeNull();
  });
});

describe("getProviderWorkday — чей режим действует на дату", () => {
  const TZ = "Europe/Moscow";
  // Понедельник 2026-03-02, 12:00 МСК.
  const MONDAY = new Date("2026-03-02T09:00:00Z");

  function weekRule(monday: { fixedStarts: string[] | null }): ScheduleRuleConfig {
    // Неделя — период из 7 позиций от понедельника (позиция 0 = Пн).
    return {
      timezone: TZ,
      periods: [
        {
          startsOn: null,
          endsOn: null,
          anchorOn: "2024-01-01",
          source: "pattern",
          days: [
            {
              isWorkday: true,
              startLocal: monday.fixedStarts ? "00:00" : "10:00",
              endLocal: monday.fixedStarts ? "23:55" : "20:00",
              breaks: [],
              fixedStarts: monday.fixedStarts,
            },
            ...Array.from({ length: 6 }, () => ({ isWorkday: false })),
          ],
        },
      ],
    };
  }

  it("фиксированная неделя даёт свои начала", () => {
    const day = getProviderWorkday({
      date: MONDAY,
      rule: weekRule({ fixedStarts: ["10:00", "13:00"] }),
      overrides: [],
    });
    expect(day.fixedStarts).toEqual(["10:00", "13:00"]);
  });

  it("обычное исключение на дату отменяет фиксированную неделю", () => {
    const day = getProviderWorkday({
      date: MONDAY,
      rule: weekRule({ fixedStarts: ["10:00"] }),
      overrides: [
        { date: MONDAY, kind: "TIME_RANGE", startLocal: "12:00", endLocal: "18:00", fixedStarts: null },
      ],
    });
    expect(day.isWorkday).toBe(true);
    expect(day.startLocal).toBe("12:00");
    expect(day.fixedStarts).toBeNull();
  });

  it("фиксированное исключение на дату поверх обычной недели", () => {
    const day = getProviderWorkday({
      date: MONDAY,
      rule: weekRule({ fixedStarts: null }),
      overrides: [
        {
          date: MONDAY,
          kind: "TIME_RANGE",
          startLocal: "00:00",
          endLocal: "23:55",
          fixedStarts: ["11:00"],
        },
      ],
    });
    expect(day.fixedStarts).toEqual(["11:00"]);
  });

  it("выходной на дату — ни часов, ни начал", () => {
    const day = getProviderWorkday({
      date: MONDAY,
      rule: weekRule({ fixedStarts: ["10:00"] }),
      overrides: [{ date: MONDAY, kind: "OFF", startLocal: null, endLocal: null }],
    });
    expect(day.isWorkday).toBe(false);
    expect(day.fixedStarts).toBeNull();
  });
});

describe("buildSlotsForDay — фиксированный день", () => {
  const fixedPlan = (fixedStarts: string[]): DayPlan => ({
    isWorking: true,
    workingIntervals: [{ start: "00:00", end: "23:55" }],
    breaks: [],
    fixedStarts,
    meta: { source: "weekly-template" },
  });
  const base = {
    dateKey: "2026-03-03",
    timeZone: "UTC",
    serviceDurationMin: 60,
    bufferMin: 0,
    now: new Date("2026-03-02T08:00:00Z"),
    slotStepMin: 30,
  };

  it("предлагает ровно выбранные начала, а не сетку дня", () => {
    const slots = buildSlotsForDay({ ...base, dayPlan: fixedPlan(["10:00", "13:00", "16:00"]), bookings: [] });
    expect(slots.map((slot) => slot.label)).toEqual([
      "2026-03-03 10:00",
      "2026-03-03 13:00",
      "2026-03-03 16:00",
    ]);
  });

  it("время не по сетке шага тоже предлагается (раньше 10:15 при шаге 30 терялось)", () => {
    const slots = buildSlotsForDay({ ...base, dayPlan: fixedPlan(["10:15"]), bookings: [] });
    expect(slots.map((slot) => slot.label)).toEqual(["2026-03-03 10:15"]);
  });

  it("занятое записью начало не предлагается", () => {
    const slots = buildSlotsForDay({
      ...base,
      dayPlan: fixedPlan(["10:00", "13:00"]),
      bookings: [
        { startAtUtc: new Date("2026-03-03T13:00:00Z"), endAtUtc: new Date("2026-03-03T14:00:00Z") },
      ],
    });
    expect(slots.map((slot) => slot.label)).toEqual(["2026-03-03 10:00"]);
  });

  it("сегодня прошедшие начала не предлагаются", () => {
    const slots = buildSlotsForDay({
      ...base,
      now: new Date("2026-03-03T11:00:00Z"),
      dayPlan: fixedPlan(["10:00", "13:00"]),
      bookings: [],
    });
    expect(slots.map((slot) => slot.label)).toEqual(["2026-03-03 13:00"]);
  });

  it("начало, после которого услуга не помещается в день, не предлагается", () => {
    const slots = buildSlotsForDay({ ...base, dayPlan: fixedPlan(["23:30"]), bookings: [] });
    expect(slots).toEqual([]);
  });

  it("фиксированный день без времён — окошек нет", () => {
    expect(buildSlotsForDay({ ...base, dayPlan: fixedPlan([]), bookings: [] })).toEqual([]);
  });
});
