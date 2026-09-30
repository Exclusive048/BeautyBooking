import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SCHEDULE-PATTERNS-01 (этап 1) — `loadDayPlans` отвечает на «работает ли
 * профиль в эти дни» тем же движком, что режет окошки, и видит «Особые дни».
 * Прежние читатели (дашборды, загрузка недели, аналитика, советник) смотрели
 * только неделю: отпуск на сегодня был для них рабочим днём.
 *
 * @probe 2026-09-28: в `createScheduleContexts` исключения не переданы в
 * сборку (`overrides: []`) — красное «Особый день закрывает рабочий по неделе
 * день» и «свои часы на дату». Возвращено — зелёный.
 * @probe 2026-09-29: в `assembleScheduleContext` развилка снова смотрит только на
 * периоды диапазона (`hasAnyPattern` не учитывается) — красное «график кончился
 * до диапазона: старая неделя не оживает» (получены Пн и Вт). Возвращено — зелёный.
 */

const MONDAY = "2026-10-05";
const TUESDAY = "2026-10-06";

type PatternRow = { providerId: string; startsOn: string | null; endsOn: string | null };

const rows = vi.hoisted(() => ({
  providers: [{ id: "m1", timezone: "Europe/Moscow" }],
  weekly: [] as unknown[],
  templates: [] as unknown[],
  overrides: [] as unknown[],
  breaks: [] as unknown[],
  patterns: [] as PatternRow[],
}));


vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findMany: vi.fn(async () => rows.providers) },
    weeklyScheduleConfig: { findMany: vi.fn(async () => rows.weekly) },
    scheduleTemplate: { findMany: vi.fn(async () => rows.templates) },
    scheduleOverride: { findMany: vi.fn(async () => rows.overrides) },
    scheduleBreak: { findMany: vi.fn(async () => rows.breaks) },
    // Периоды читаются все, без фильтра по датам: отбор по диапазону — в движке.
    schedulePattern: { findMany: vi.fn(async () => rows.patterns) },
  },
}));

import { dayPlanHours, dayPlanWorkMinutes, loadDayPlans } from "@/lib/schedule/day-plans";

const NOW = new Date("2026-10-01T09:00:00Z");

beforeEach(() => {
  // Пн–Вт рабочие 10:00–20:00 с обедом 14:00–15:00 (1 = Пн, 2 = Вт).
  rows.weekly = [
    {
      providerId: "m1",
      days: [1, 2].map((weekday) => ({
        weekday,
        templateId: "t1",
        isActive: true,
        scheduleMode: "FLEXIBLE",
        fixedSlotTimes: [],
      })),
    },
  ];
  rows.templates = [
    {
      providerId: "m1",
      id: "t1",
      startLocal: "10:00",
      endLocal: "20:00",
      breaks: [{ startLocal: "14:00", endLocal: "15:00", sortOrder: 0 }],
    },
  ];
  rows.overrides = [];
  rows.breaks = [];
  rows.patterns = [];
});

describe("loadDayPlans", () => {
  it("рабочий по неделе день — рабочий, с часами и перерывом", async () => {
    const plans = await loadDayPlans({
      providerIds: ["m1"],
      fromKey: MONDAY,
      toKeyExclusive: "2026-10-08",
      now: NOW,
    });
    const monday = plans.get("m1")?.get(MONDAY);
    expect(monday?.isWorking).toBe(true);
    expect(dayPlanHours(monday)).toEqual({ start: "10:00", end: "20:00" });
    expect(dayPlanWorkMinutes(monday)).toBe(9 * 60);
    // Среда по неделе выходная.
    expect(plans.get("m1")?.get("2026-10-07")?.isWorking).toBe(false);
  });

  it("Особый день закрывает рабочий по неделе день", async () => {
    rows.overrides = [
      {
        providerId: "m1",
        date: new Date(`${MONDAY}T00:00:00.000Z`),
        kind: "OFF",
        isDayOff: true,
        startLocal: null,
        endLocal: null,
        templateId: null,
        isActive: null,
        note: "Отпуск",
        reason: null,
        scheduleMode: "FLEXIBLE",
        fixedSlotTimes: [],
      },
    ];
    const plans = await loadDayPlans({
      providerIds: ["m1"],
      fromKey: MONDAY,
      toKeyExclusive: "2026-10-07",
      now: NOW,
    });
    expect(plans.get("m1")?.get(MONDAY)?.isWorking).toBe(false);
    expect(plans.get("m1")?.get(TUESDAY)?.isWorking).toBe(true);
  });

  it("свои часы на дату", async () => {
    rows.overrides = [
      {
        providerId: "m1",
        date: new Date(`${TUESDAY}T00:00:00.000Z`),
        kind: "TIME_RANGE",
        isDayOff: false,
        startLocal: "12:00",
        endLocal: "16:00",
        templateId: null,
        isActive: null,
        note: null,
        reason: null,
        scheduleMode: "FLEXIBLE",
        fixedSlotTimes: [],
      },
    ];
    const plans = await loadDayPlans({
      providerIds: ["m1"],
      fromKey: TUESDAY,
      toKeyExclusive: "2026-10-07",
      now: NOW,
    });
    expect(dayPlanHours(plans.get("m1")?.get(TUESDAY))).toEqual({ start: "12:00", end: "16:00" });
  });

  it("день за горизонтом расписания закрыт", async () => {
    const farMonday = "2027-03-01"; // > 92 дней от NOW
    const plans = await loadDayPlans({
      providerIds: ["m1"],
      fromKey: farMonday,
      toKeyExclusive: "2027-03-02",
      now: NOW,
    });
    expect(plans.get("m1")?.get(farMonday)?.isWorking).toBe(false);
  });
});

describe("dayPlanWorkMinutes", () => {
  it("фиксированное время — ёмкости в минутах нет", () => {
    expect(
      dayPlanWorkMinutes({
        isWorking: true,
        workingIntervals: [{ start: "00:00", end: "23:55" }],
        breaks: [],
        fixedStarts: ["10:00"],
        meta: { source: "weekly-template" },
      }),
    ).toBeNull();
  });

  it("выходной — ноль", () => {
    expect(
      dayPlanWorkMinutes({ isWorking: false, workingIntervals: [], breaks: [], meta: { source: "override" } }),
    ).toBe(0);
  });
});

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — графики с датами. Неделя профиля без графика
 * читается как раньше (кейсы выше), а с графиком действует только график.
 *
 * @probe 2026-09-28: в `findPeriodForDate` снята проверка `endsOn` — красное
 * «после конца настроенного расписания дни закрыты». Возвращено — зелёный.
 */
describe("loadDayPlans — графики", () => {
  function pattern(input: {
    startsOn?: string | null;
    endsOn?: string | null;
    anchorOn: string;
    days: Array<string | null>;
  }) {
    return {
      providerId: "m1",
      startsOn: input.startsOn ?? null,
      endsOn: input.endsOn ?? null,
      anchorOn: input.anchorOn,
      cycleDays: input.days.length,
      days: input.days.map((templateId, position) => ({ position, templateId })),
    };
  }

  async function workingDays(fromKey: string, toKeyExclusive: string): Promise<string[]> {
    const plans = await loadDayPlans({ providerIds: ["m1"], fromKey, toKeyExclusive, now: NOW });
    return Array.from(plans.get("m1")?.entries() ?? [])
      .filter(([, plan]) => plan.isWorking)
      .map(([key]) => key);
  }

  it("2 через 2 от первого рабочего дня", async () => {
    rows.patterns = [pattern({ anchorOn: "2026-10-05", days: ["t1", "t1", null, null] })];
    expect(await workingDays("2026-10-05", "2026-10-13")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-09",
      "2026-10-10",
    ]);
  });

  it("график действует вместо недели профиля", async () => {
    // По неделе Пн–Вт рабочие; по графику «сутки через двое» от среды.
    rows.patterns = [pattern({ anchorOn: "2026-10-07", days: ["t1", null, null] })];
    expect(await workingDays("2026-10-05", "2026-10-11")).toEqual(["2026-10-07", "2026-10-10"]);
  });

  it("график кончился до диапазона: старая неделя не оживает", async () => {
    // По неделе Пн–Вт рабочие, но у профиля был график — он кончился 30 сентября.
    rows.patterns = [pattern({ anchorOn: "2026-09-01", endsOn: "2026-09-30", days: ["t1"] })];
    expect(await workingDays("2026-10-05", "2026-10-09")).toEqual([]);
  });

  it("у профиля без графика действует неделя", async () => {
    rows.patterns = [];
    expect(await workingDays("2026-10-05", "2026-10-09")).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("после конца настроенного расписания дни закрыты", async () => {
    rows.patterns = [pattern({ anchorOn: "2026-10-05", endsOn: "2026-10-06", days: ["t1"] })];
    expect(await workingDays("2026-10-05", "2026-10-09")).toEqual(["2026-10-05", "2026-10-06"]);
  });

  it("периоды сменяют друг друга: неделя до 7-го, с 8-го — 2 через 2", async () => {
    rows.patterns = [
      pattern({ endsOn: "2026-10-07", anchorOn: "2024-01-01", days: ["t1", "t1", "t1", "t1", "t1", null, null] }),
      pattern({ startsOn: "2026-10-08", anchorOn: "2026-10-08", days: ["t1", "t1", null, null] }),
    ];
    expect(await workingDays("2026-10-05", "2026-10-14")).toEqual([
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-12",
      "2026-10-13",
    ]);
  });
});
