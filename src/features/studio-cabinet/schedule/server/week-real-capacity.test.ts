import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DayPlan } from "@/lib/schedule/types";

/**
 * MOBILE-POLISH — неделя календаря студии в вебе (`/cabinet/studio/schedule?view=week`)
 * считает загрузку по НАСТОЯЩЕМУ графику мастера, тем же расчётом, что неделя
 * приложения (`loadStudioWeekCells` → `buildStudioWeekCell`), а не
 * «5 записей = 100%»: ёмкость — рабочие минуты без перерывов, день
 * «Фиксированное время» — доля занятых начал, выходной — по графику.
 */

const bookingFindMany = vi.hoisted(() => vi.fn());
const loadDayPlans = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    studio: {
      findUnique: vi.fn(async () => ({
        id: "studio1",
        providerId: "studio-prov",
        provider: { timezone: "Asia/Yekaterinburg" },
      })),
    },
    provider: {
      findMany: vi.fn(async () => [
        {
          id: "marina",
          name: "Марина",
          avatarUrl: null,
          studioPaused: false,
          ownerUserId: "u-marina",
          ratingAvg: 5,
          ratingCount: 1,
          masterServices: [],
        },
        {
          id: "invited",
          name: "Ольга",
          avatarUrl: null,
          studioPaused: false,
          ownerUserId: null,
          ratingAvg: null,
          ratingCount: 0,
          masterServices: [],
        },
      ]),
    },
    booking: { findMany: bookingFindMany },
    timeBlock: { findMany: vi.fn(async () => []) },
    service: { findMany: vi.fn(async () => []) },
    masterService: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/schedule/day-plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/day-plans")>()),
  loadDayPlans,
}));

import { loadStudioScheduleData } from "./schedule-data.service";

const meta = { source: "pattern" as const };
const working = (start: string, end: string, breaks: DayPlan["breaks"] = []): DayPlan => ({
  isWorking: true,
  workingIntervals: [{ start, end }],
  breaks,
  meta,
});

// Неделя 28.09–04.10.2026 (пн–вс), салон — UTC+5.
const PLANS = new Map<string, Map<string, DayPlan>>([
  [
    "marina",
    new Map<string, DayPlan>([
      ["2026-09-28", working("10:00", "19:00", [{ start: "13:00", end: "14:00" }])],
      ["2026-09-29", { isWorking: false, workingIntervals: [], breaks: [], meta }],
      ["2026-09-30", { ...working("00:00", "23:55"), fixedStarts: ["10:00", "12:00", "14:00", "16:00"] }],
    ]),
  ],
]);

function weekBooking(startUtc: string, endUtc: string) {
  return {
    masterProviderId: "marina",
    providerId: "studio-prov",
    startAtUtc: new Date(startUtc),
    endAtUtc: new Date(endUtc),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  loadDayPlans.mockResolvedValue(PLANS);
  bookingFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
    "clientName" in args.select
      ? []
      : [
          // пн: 1 ч + 2 ч = 180 мин из 480 (9 ч минус перерыв)
          weekBooking("2026-09-28T05:00:00Z", "2026-09-28T06:00:00Z"),
          weekBooking("2026-09-28T09:00:00Z", "2026-09-28T11:00:00Z"),
          // ср: 1 из 4 фиксированных начал
          weekBooking("2026-09-30T05:00:00Z", "2026-09-30T06:00:00Z"),
        ],
  );
});

describe("веб-неделя студии — загрузка по графику", () => {
  it("ячейки по графику мастера, как у приложения", async () => {
    const data = await loadStudioScheduleData({ studioId: "studio1", dateKey: "2026-10-01", view: "week" });
    const marina = data.week!.rows.find((row) => row.master.id === "marina")!;
    expect(marina.cells.map((cell) => cell.dateKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(marina.cells[0]).toEqual({
      dateKey: "2026-09-28",
      booked: 2,
      bookedMinutes: 180,
      capacityMinutes: 480,
      fixedSlots: null,
      percent: 38,
      isDayOff: false,
    });
    expect(marina.cells[1]).toMatchObject({ isDayOff: true, capacityMinutes: 0, percent: 0 });
    expect(marina.cells[2]).toMatchObject({ isDayOff: false, booked: 1, fixedSlots: 4, capacityMinutes: null, percent: 25 });
    // Дня нет в плане (нет графика) — выходной, а не «0 из 5».
    expect(marina.cells[3]).toMatchObject({ isDayOff: true, percent: 0 });
  });

  it("приглашённый мастер — вся неделя выходная, план движка для него не грузим", async () => {
    const data = await loadStudioScheduleData({ studioId: "studio1", dateKey: "2026-10-01", view: "week" });
    const invited = data.week!.rows.find((row) => row.master.id === "invited")!;
    expect(invited.cells.every((cell) => cell.isDayOff && cell.percent === 0)).toBe(true);
    const weekCall = loadDayPlans.mock.calls.find(([args]) => args.fromKey === "2026-09-28");
    expect(weekCall?.[0]).toMatchObject({ providerIds: ["marina"], fromKey: "2026-09-28", toKeyExclusive: "2026-10-05" });
  });

  it("записи недели — только студийные, без отменённых, в границах недели салона", async () => {
    await loadStudioScheduleData({ studioId: "studio1", dateKey: "2026-10-01", view: "week" });
    const weekQuery = bookingFindMany.mock.calls
      .map(([args]) => args)
      .find((args) => !("clientName" in args.select));
    expect(weekQuery.where).toMatchObject({
      studioId: "studio1",
      startAtUtc: { gte: new Date("2026-09-27T19:00:00Z"), lt: new Date("2026-10-04T19:00:00Z") },
      status: { notIn: ["REJECTED", "CANCELLED", "NO_SHOW"] },
    });
  });
});
