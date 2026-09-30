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
 */

const STUDIO_ID = "studio1";
const STUDIO_PROVIDER_ID = "studio-prov";

const bookingFindMany = vi.hoisted(() => vi.fn());

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

import { loadStudioScheduleData } from "./schedule-data.service";

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
  bookingFindMany.mockReset();
  bookingFindMany.mockImplementation(async (args: { select: Record<string, unknown> }) =>
    "clientName" in args.select
      ? [
          row({ id: "studio-booking" }),
          row({ id: "personal", studioId: null, providerId: "marina", clientName: "Ольга", clientPhone: "+79990000001" }),
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
    const data = await loadStudioScheduleData({ studioId: STUDIO_ID, dateKey: "2026-10-01", view: "day" });
    expect(data.kpis.bookingsCount).toBe(1);
    expect(data.kpis.revenueKopeks).toBe(150000);
    // Загрузка считает обе: время мастера занято и личной записью.
    expect(data.kpis.freeWindowsCount).toBe(data.kpis.occupancyHoursDenominator - 2);
  });
});
