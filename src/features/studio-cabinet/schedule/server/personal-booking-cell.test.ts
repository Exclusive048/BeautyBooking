import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * STUDIO-MASTER-OWN-BOOKINGS-01 — календарь студии показывает запись с личной
 * страницы мастера (`studioId = null`), чтобы админ видел занятость мастера
 * (LOGIC-01), но студия ею не управляет: `auth/ownership.ts` выводит право из
 * `Booking.studioId`, и «Подтвердить» / «Отменить» на такой ячейке отвечали
 * 403. Ячейка приходит «личной»: без имени и телефона клиента, услуги, цены и
 * предложения переноса, — а в записях и выручке студии не считается.
 *
 * @probe 2026-09-23 — `isPersonalBooking` возвращал `false` всегда: красные
 *        «личная запись приходит только занятостью» и «…не считается записью
 *        студии». Возвращено — зелёный.
 * @probe 2026-10-30 (SCHEDULE-FLEX-DATE-NAV) — окошки и загрузка без личных
 *        записей (`!cell.isPersonal` в `buildMasterDayStats`): красный «…но
 *        занимает время» — «expected 11 to be 22». Возвращено — зелёный.
 */

const STUDIO_ID = "studio1";
const STUDIO_PROVIDER_ID = "studio-prov";

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
      ]),
    },
    booking: { findMany: bookingFindMany },
    timeBlock: { findMany: vi.fn(async () => []) },
    service: { findMany: vi.fn(async () => []) },
    masterService: { findMany: vi.fn(async () => []) },
    // BOOKING-FLOW-AUDIT-RESIDUALS: сетка дня раздвигается под часы мастеров
    // (SCHEDULE-PATTERNS-01: `loadDayPlans`, движок) — здесь расписания нет,
    // сетка по умолчанию.
    weeklyScheduleConfig: { findMany: vi.fn(async () => []) },
    scheduleTemplate: { findMany: vi.fn(async () => []) },
    scheduleOverride: { findMany: vi.fn(async () => []) },
    scheduleBreak: { findMany: vi.fn(async () => []) },
    schedulePattern: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock("@/lib/schedule/day-plans", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/schedule/day-plans")>()),
  loadDayPlans,
}));

import { loadStudioScheduleData, loadStudioScheduleDay } from "./schedule-data.service";

// 01.10.2026 Марина работает 10:00–19:00 (салон, UTC+5); «сейчас» — накануне.
const NOW = new Date("2026-09-30T12:00:00Z");
const PLANS = new Map([
  [
    "marina",
    new Map([
      ["2026-10-01", { isWorking: true, workingIntervals: [{ start: "10:00", end: "19:00" }], breaks: [], meta: { source: "pattern" } }],
    ]),
  ],
]);

function row(patch: Record<string, unknown>) {
  return {
    id: "b",
    studioId: STUDIO_ID,
    masterProviderId: "marina",
    providerId: STUDIO_PROVIDER_ID,
    serviceId: "svc",
    startAtUtc: new Date("2026-10-01T05:00:00Z"),
    endAtUtc: new Date("2026-10-01T06:00:00Z"),
    status: "CONFIRMED",
    clientName: "Елена Петрова",
    clientPhone: "+79995000000",
    clientUserId: "elena",
    proposedStartAt: null,
    proposedEndAt: null,
    actionRequiredBy: null,
    service: { name: "Маникюр", title: null, price: 150000 },
    serviceItems: [{ priceSnapshot: 150000 }],
    ...patch,
  };
}

beforeEach(() => {
  loadDayPlans.mockResolvedValue(PLANS);
  bookingFindMany.mockReset();
  bookingFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
    "clientName" in args.select
      ? [
          row({ id: "studio-booking" }),
          // Личная — 12:00–13:00 салона.
          row({
            id: "personal",
            studioId: null,
            providerId: "marina",
            clientName: "Ольга",
            clientPhone: "+79990000001",
            startAtUtc: new Date("2026-10-01T07:00:00Z"),
            endAtUtc: new Date("2026-10-01T08:00:00Z"),
          }),
        ]
      : [],
  );
});

describe("календарь студии — личная запись мастера", () => {
  it("личная запись приходит только занятостью: без клиента, услуги, цены и действий", async () => {
    const data = await loadStudioScheduleData({ studioId: STUDIO_ID, dateKey: "2026-10-01", view: "day" });
    const personal = data.day.bookings.find((b) => b.id === "personal")!;
    expect(personal).toMatchObject({
      isPersonal: true,
      clientName: "",
      clientPhone: null,
      serviceTitle: "",
      priceKopeks: 0,
      proposedStartAtUtc: null,
      actionRequiredBy: null,
    });
    expect(data.day.bookings.find((b) => b.id === "studio-booking")).toMatchObject({
      isPersonal: false,
      clientName: "Елена Петрова",
    });
  });

  it("личная запись не считается записью студии, но занимает время", async () => {
    // Показатели дня — у приложения (`loadStudioScheduleDay`); веб их не показывает.
    const day = await loadStudioScheduleDay({ studioId: STUDIO_ID, dateKey: "2026-10-01", now: NOW });
    expect(day!.kpis.bookingsCount).toBe(1);
    expect(day!.kpis.revenueKopeks).toBe(150000);
    // Загрузка и окошки считают обе: время мастера занято и личной записью.
    // 120 из 540 минут; свободно 11–12 и 13–19 (без личной было бы 11–19).
    expect(day!.kpis.occupancyPercent).toBe(22);
    expect(day!.kpis.freeWindowsCount).toBe(2);
    const data = await loadStudioScheduleData({ studioId: STUDIO_ID, dateKey: "2026-10-01", view: "day", now: NOW });
    expect(data.freeWindows[0]!.days[0]!.windows).toEqual([
      { startMin: 11 * 60, endMin: 12 * 60 },
      { startMin: 13 * 60, endMin: 19 * 60 },
    ]);
  });
});
