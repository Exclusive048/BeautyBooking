import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRole } from "@prisma/client";
import { encodeOffsetCursor } from "@/lib/pagination/offset-cursor";

/**
 * MOBILE-STUDIO-C (ops) — JSON-чтения кабинета студии для приложения:
 * главная, день и неделя календаря, журнал и карточка записи, мастера и
 * услуги для записи, уведомления студии (лента, счётчик, «прочитать все»).
 * Доступ — только владелец / администратор студии (мастер студии — 403),
 * без телефонов в списках, 4xx как есть, 5xx без причины.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveCurrentStudioAccess = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const loadStudioDashboardData = vi.hoisted(() => vi.fn());
const listStudioBookings = vi.hoisted(() => vi.fn());
const loadStudioBookingsKpis = vi.hoisted(() => vi.fn());
const loadStudioMasterOptions = vi.hoisted(() => vi.fn());
const loadStudioScheduleDay = vi.hoisted(() => vi.fn());
const loadStudioScheduleWeek = vi.hoisted(() => vi.fn());
const getStudioBookingDetail = vi.hoisted(() => vi.fn());
const loadStudioCabinetShellExtras = vi.hoisted(() => vi.fn());
const loadStudioNotificationFeed = vi.hoisted(() => vi.fn());
const getStudioNotificationCounts = vi.hoisted(() => vi.fn());
const markStudioNotificationsRead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/current", () => ({ resolveCurrentStudioAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique: providerFindUnique } } }));
vi.mock("@/features/studio-cabinet/dashboard/server/dashboard-data.service", () => ({ loadStudioDashboardData }));
vi.mock("@/features/studio-cabinet/bookings/server/bookings-list.service", () => ({ listStudioBookings }));
vi.mock("@/features/studio-cabinet/bookings/server/bookings-kpis.service", () => ({
  loadStudioBookingsKpis,
  loadStudioMasterOptions,
}));
vi.mock("@/features/studio-cabinet/schedule/server/schedule-data.service", () => ({ loadStudioScheduleDay }));
vi.mock("@/features/studio-cabinet/schedule/server/calendar-week.service", () => ({ loadStudioScheduleWeek }));
vi.mock("@/features/studio-cabinet/bookings/server/booking-detail.service", () => ({ getStudioBookingDetail }));
vi.mock("@/features/studio-cabinet/schedule/server/shell-extras.service", () => ({ loadStudioCabinetShellExtras }));
vi.mock("@/features/studio-cabinet/notifications/server/notifications-feed.service", () => ({
  loadStudioNotificationFeed,
}));
vi.mock("@/lib/notifications/studio-feed", () => ({ getStudioNotificationCounts, markStudioNotificationsRead }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { GET as getDashboard } from "./dashboard/route";
import { GET as getCalendarDay } from "./calendar/day/route";
import { GET as getCalendarWeek } from "./calendar/week/route";
import { GET as getBookings } from "./bookings/route";
import { GET as getBookingDetail } from "./bookings/[id]/route";
import { GET as getBookingOptions } from "./booking-options/route";
import { GET as getNotifications } from "./notifications/route";
import { GET as getUnreadCount } from "./notifications/unread-count/route";
import { POST as postReadAll } from "./notifications/read-all/route";

type Body = { ok: boolean; data?: Record<string, unknown>; error?: { code: string; message: string } };

const NOW = new Date("2026-10-04T05:00:00.000Z");
const TZ = "Asia/Yekaterinburg";

const get = (path: string) => new Request(`http://localhost${path}`);
const json = async (res: Response) => (await res.json()) as Body;

function bookingRow(patch: Record<string, unknown> = {}) {
  return {
    id: "b1",
    startAtUtc: "2026-10-05T05:00:00.000Z",
    endAtUtc: "2026-10-05T06:30:00.000Z",
    master: { id: "m1", displayName: "Марина", avatarUrl: null, specialization: "" },
    client: { displayName: "Елена", phone: "+79991234567", isNewClient: true, isVip: false },
    serviceId: "svc1",
    service: { name: "Маникюр", durationMin: 90 },
    priceKopeks: 250000,
    source: "MANUAL",
    status: "PENDING",
    proposedStartAtUtc: null,
    proposedEndAtUtc: null,
    actionRequiredBy: "MASTER",
    bookingPackageId: null,
    ...patch,
  };
}

function asMaster() {
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "provider-s1",
    roles: [StudioRole.MASTER],
  });
}

async function expectForbiddenForMaster(call: () => Promise<Response>) {
  asMaster();
  const res = await call();
  const body = await json(res);
  expect(res.status).toBe(403);
  expect(body.error).toMatchObject({ code: "FORBIDDEN", message: "Этот раздел доступен владельцу студии." });
}

async function expectUnauthorized(call: () => Promise<Response>) {
  getSessionUser.mockResolvedValue(null);
  resolveCurrentStudioAccess.mockClear();
  const res = await call();
  expect(res.status).toBe(401);
  expect((await json(res)).error?.code).toBe("UNAUTHORIZED");
  expect(resolveCurrentStudioAccess).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  getSessionUser.mockResolvedValue({ id: "user-1", phone: "+79990000000", roles: ["STUDIO"] });
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "provider-s1",
    roles: [StudioRole.ADMIN],
  });
  providerFindUnique.mockResolvedValue({ timezone: TZ });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/cabinet/studio/dashboard", () => {
  const call = () => getDashboard(get("/api/cabinet/studio/dashboard"));

  beforeEach(() => {
    const tile = (current: number, previous: number, value: number | null, tone: string) => ({
      current,
      previous,
      delta: { text: "x", tone, value },
    });
    loadStudioDashboardData.mockResolvedValue({
      todayBanner: {
        bookingsToday: 7,
        mastersOnShift: [{ id: "m1", name: "Марина", avatarUrl: null }],
        totalMasters: 4,
        averageLoadPercent: 50,
        timeZone: TZ,
      },
      kpis: {
        revenueKopeks: tile(1500000, 1200000, 25, "positive"),
        bookingsCount: tile(40, 0, null, "neutral"),
        averageCheckKopeks: 37500,
        occupancyPercent: tile(27, 28, -1, "negative"),
        averageRating: tile(4.8, 4.8, 0, "neutral"),
        ratingCount: 31,
        mastersOnShiftCount: 1,
        totalMastersCount: 4,
      },
      topMasters: [],
      attentionItems: [
        { id: "bookings-awaiting", count: 3, href: "/cabinet/studio/calendar", urgent: false },
        { id: "schedule-requests", count: 1, href: "/cabinet/studio/schedule-requests", urgent: true },
      ],
      attentionTotal: 2,
      attentionUrgent: 1,
      topOccupancyToday: [],
      popularServices: [],
      revenueChart: { totalKopeks: 1500000, points: [] },
    });
    listStudioBookings.mockResolvedValue({
      items: [bookingRow()],
      nextCursor: null,
      rangeCounts: { today: 0, tomorrow: 0, week: 0, all: 0 },
      timezone: TZ,
    });
  });

  it("returns raw KPI numbers, attention without web links and awaiting bookings with actions", async () => {
    const res = await call();
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(body.data).toMatchObject({
      studioId: "studio-1",
      timezone: TZ,
      todayKey: "2026-10-04",
      today: { bookingsCount: 7, totalMasters: 4, averageLoadPercent: 50 },
      kpis: {
        periodDays: 30,
        revenueKopeks: { current: 1500000, previous: 1200000, delta: 25, tone: "positive" },
        bookingsCount: { current: 40, previous: 0, delta: null, tone: "neutral" },
        averageCheckKopeks: 37500,
      },
      attention: {
        items: [
          { id: "bookings-awaiting", count: 3, urgent: false },
          { id: "schedule-requests", count: 1, urgent: true },
        ],
        urgentCount: 1,
        bookingsTotal: 3,
      },
      revenueChart: { period: "30d", totalKopeks: 1500000, points: [] },
    });
    const raw = JSON.stringify(body.data);
    expect(raw).not.toContain("/cabinet/");
    expect(raw).not.toContain("+7999");

    const [booking] = (body.data?.attention as { bookings: Array<Record<string, unknown>> }).bookings;
    expect(booking).toMatchObject({
      id: "b1",
      runtimeStatus: "PENDING",
      durationMin: 90,
      master: { id: "m1", name: "Марина", specialization: null },
      client: { name: "Елена", isNewClient: true, isVip: false },
      needsAnswer: true,
      actions: { confirm: true, move: true, cancel: true, wholePackageOnly: false },
    });

    expect(listStudioBookings).toHaveBeenCalledWith({
      studioId: "studio-1",
      filters: { range: "all", status: ["PENDING", "CHANGE_REQUESTED"], startsAfter: NOW },
      page: { offset: 0, limit: 20 },
      withRangeCounts: false,
    });
  });

  it("answers 401 without a session", async () => {
    await expectUnauthorized(call);
  });

  it("refuses a studio master", async () => {
    await expectForbiddenForMaster(call);
    expect(loadStudioDashboardData).not.toHaveBeenCalled();
  });

  it("hides the cause of a server failure", async () => {
    loadStudioDashboardData.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect((await json(res)).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Не удалось загрузить главную студии. Попробуйте ещё раз.",
    });
  });
});

describe("GET /api/cabinet/studio/calendar/day", () => {
  const call = (query = "") => getCalendarDay(get(`/api/cabinet/studio/calendar/day${query}`));

  beforeEach(() => {
    loadStudioScheduleDay.mockResolvedValue({
      studioId: "studio-1",
      timezone: TZ,
      todayKey: "2026-10-04",
      day: {
        dateKey: "2026-10-05",
        dayStartIso: "2026-10-04T19:00:00.000Z",
        gridWindow: { startHour: 9, endHour: 21 },
        columns: [
          { id: "m1", name: "Марина", avatarUrl: null, rating: 4.9, reviewsCount: 12, isAvailable: true, serviceIds: ["svc1"] },
          { id: "m2", name: "Ольга", avatarUrl: null, rating: 0, reviewsCount: 0, isAvailable: false, serviceIds: [] },
        ],
        bookings: [
          {
            id: "b1",
            masterId: "m1",
            startAtUtc: "2026-10-05T05:00:00.000Z",
            endAtUtc: "2026-10-05T06:00:00.000Z",
            status: "CONFIRMED",
            tone: "confirmed",
            clientName: "Елена",
            clientPhone: "+79991234567",
            isNewClient: true,
            serviceTitle: "Маникюр",
            serviceId: "svc1",
            priceKopeks: 250000,
            proposedStartAtUtc: null,
            proposedEndAtUtc: null,
            actionRequiredBy: null,
            bookingPackageId: "pkg1",
            isPersonal: false,
          },
          {
            id: "p1",
            masterId: "m1",
            startAtUtc: "2026-10-05T08:00:00.000Z",
            endAtUtc: "2026-10-05T09:00:00.000Z",
            status: "CONFIRMED",
            tone: "confirmed",
            clientName: "",
            clientPhone: null,
            isNewClient: false,
            serviceTitle: "",
            serviceId: "svc-x",
            priceKopeks: 0,
            proposedStartAtUtc: null,
            proposedEndAtUtc: null,
            actionRequiredBy: null,
            bookingPackageId: null,
            isPersonal: true,
          },
        ],
        breaks: [
          {
            id: "blk1",
            masterId: "m1",
            startAtUtc: "2026-10-05T08:00:00.000Z",
            endAtUtc: "2026-10-05T09:00:00.000Z",
            type: "BREAK",
            note: null,
          },
        ],
      },
      kpis: {
        bookingsCount: 1,
        bookingsConfirmedCount: 1,
        revenueKopeks: 250000,
        occupancyPercent: 40,
        occupancyHoursDenominator: 5,
        mastersOnShift: 1,
        freeWindowsCount: 3,
      },
      plans: new Map([
        [
          "m1",
          {
            isWorking: true,
            workingIntervals: [{ start: "10:00", end: "19:00" }],
            breaks: [{ start: "13:00", end: "14:00" }],
            meta: { source: "weekly-template" },
          },
        ],
      ]),
    });
  });

  it("returns columns with real hours, studio bookings with actions, personal busy time and blocks", async () => {
    const res = await call("?date=2026-10-05");
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(loadStudioScheduleDay).toHaveBeenCalledWith({ studioId: "studio-1", dateKey: "2026-10-05", now: NOW });
    expect(body.data).toMatchObject({
      studioId: "studio-1",
      timezone: TZ,
      date: "2026-10-05",
      todayKey: "2026-10-04",
      dayStartUtc: "2026-10-04T19:00:00.000Z",
      gridWindow: { startHour: 9, endHour: 21 },
      masters: [
        {
          id: "m1",
          hours: {
            isWorking: true,
            intervals: [{ start: "10:00", end: "19:00" }],
            breaks: [{ start: "13:00", end: "14:00" }],
            fixedStarts: null,
          },
        },
        { id: "m2", isAvailable: false, hours: { isWorking: false, intervals: [], breaks: [], fixedStarts: null } },
      ],
      bookings: [
        {
          id: "b1",
          runtimeStatus: "CONFIRMED",
          tone: "new",
          durationMin: 60,
          bookingPackageId: "pkg1",
          needsAnswer: false,
          actions: { confirm: false, move: true, cancel: true, wholePackageOnly: true },
        },
      ],
      personalBusy: [
        { id: "p1", masterId: "m1", startAtUtc: "2026-10-05T08:00:00.000Z", endAtUtc: "2026-10-05T09:00:00.000Z" },
      ],
      blocks: [{ id: "blk1", masterId: "m1", type: "BREAK", note: null }],
      kpis: { bookingsCount: 1, occupancyPercent: 40, freeWindowsCount: 3 },
    });
    expect(body.data?.kpis).not.toHaveProperty("occupancyHoursDenominator");
    expect(JSON.stringify(body.data)).not.toContain("+7999");
    expect((body.data?.bookings as unknown[]).length).toBe(1);
  });

  it("defaults to the salon's today", async () => {
    await call();
    expect(loadStudioScheduleDay).toHaveBeenCalledWith({ studioId: "studio-1", dateKey: undefined, now: NOW });
  });

  it("rejects an impossible date", async () => {
    const res = await call("?date=2026-02-31");
    expect(res.status).toBe(400);
    expect((await json(res)).error?.code).toBe("VALIDATION_ERROR");
    expect(loadStudioScheduleDay).not.toHaveBeenCalled();
  });

  it("refuses a studio master before validating the query", async () => {
    await expectForbiddenForMaster(() => call("?date=bad"));
  });

  it("hides the cause of a server failure", async () => {
    loadStudioScheduleDay.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect((await json(res)).error?.message).toBe("Не удалось загрузить расписание. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/studio/calendar/week", () => {
  const call = (query = "") => getCalendarWeek(get(`/api/cabinet/studio/calendar/week${query}`));

  it("returns the week from the schedule engine", async () => {
    const week = {
      studioId: "studio-1",
      timezone: TZ,
      todayKey: "2026-10-04",
      from: "2026-09-28",
      to: "2026-10-04",
      days: [],
      masters: [],
    };
    loadStudioScheduleWeek.mockResolvedValue(week);

    const res = await call("?date=2026-10-01");
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual(week);
    expect(loadStudioScheduleWeek).toHaveBeenCalledWith({ studioId: "studio-1", dateKey: "2026-10-01" });
  });

  it("rejects a malformed date", async () => {
    const res = await call("?date=01.10.2026");
    expect(res.status).toBe(400);
  });

  it("answers 401 and 403", async () => {
    await expectUnauthorized(call);
    getSessionUser.mockResolvedValue({ id: "user-1", phone: null, roles: [] });
    await expectForbiddenForMaster(call);
  });
});

describe("GET /api/cabinet/studio/bookings", () => {
  const call = (query = "") => getBookings(get(`/api/cabinet/studio/bookings${query}`));

  beforeEach(() => {
    listStudioBookings.mockResolvedValue({
      items: [bookingRow({ status: "CONFIRMED", actionRequiredBy: null })],
      nextCursor: "b1",
      rangeCounts: { today: 7, tomorrow: 5, week: 31, all: 412 },
      timezone: TZ,
    });
    loadStudioBookingsKpis.mockResolvedValue({ todayCount: 7 });
    loadStudioMasterOptions.mockResolvedValue([{ id: "m1", name: "Марина" }]);
  });

  it("maps the status group, pages by offset and keeps phones out of items", async () => {
    const res = await call(`?range=week&status=awaiting&master=m1&q=%20Ел%20&limit=1&cursor=${encodeOffsetCursor(20)}`);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(listStudioBookings).toHaveBeenCalledWith({
      studioId: "studio-1",
      filters: { range: "week", status: ["NEW", "PENDING", "CHANGE_REQUESTED"], masterId: "m1", search: "Ел" },
      page: { offset: 20, limit: 1 },
    });
    expect(body.data).toMatchObject({
      studioId: "studio-1",
      timezone: TZ,
      range: "week",
      status: "awaiting",
      rangeCounts: { today: 7, tomorrow: 5, week: 31, all: 412 },
      kpis: { todayCount: 7 },
      masters: [{ id: "m1", name: "Марина" }],
      items: [{ id: "b1", runtimeStatus: "CONFIRMED", needsAnswer: false, actions: { move: true, cancel: true } }],
      nextCursor: encodeOffsetCursor(21),
    });
    expect(JSON.stringify(body.data)).not.toContain("+7999");
  });

  it("uses the defaults and passes «all» through", async () => {
    listStudioBookings.mockResolvedValue({
      items: [],
      nextCursor: null,
      rangeCounts: { today: 0, tomorrow: 0, week: 0, all: 0 },
      timezone: TZ,
    });
    const body = await json(await call());
    expect(listStudioBookings).toHaveBeenCalledWith({
      studioId: "studio-1",
      filters: { range: "today", status: "all", masterId: "all", search: undefined },
      page: { offset: 0, limit: 20 },
    });
    expect(body.data?.nextCursor).toBeNull();
  });

  it("rejects an unknown status and a foreign cursor", async () => {
    expect((await call("?status=lost")).status).toBe(400);
    const res = await call("?cursor=garbage");
    expect(res.status).toBe(400);
    expect((await json(res)).error?.message).toBe("Список обновился. Загрузите его заново.");
  });

  it("refuses a studio master", async () => {
    await expectForbiddenForMaster(call);
  });

  it("hides the cause of a server failure", async () => {
    loadStudioBookingsKpis.mockRejectedValue(new Error("db down"));
    const res = await call();
    expect(res.status).toBe(500);
    expect((await json(res)).error?.message).toBe("Не удалось загрузить записи. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/studio/bookings/{id}", () => {
  const call = (id: string) =>
    getBookingDetail(get(`/api/cabinet/studio/bookings/${id}`), { params: Promise.resolve({ id }) });

  it("returns the booking with the client phone", async () => {
    getStudioBookingDetail.mockResolvedValue({ id: "b1", client: { phone: "+79991234567" } });

    const res = await call("b1");
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      studioId: "studio-1",
      timezone: TZ,
      booking: { id: "b1", client: { phone: "+79991234567" } },
    });
    expect(getStudioBookingDetail).toHaveBeenCalledWith({
      studioId: "studio-1",
      studioProviderId: "provider-s1",
      bookingId: "b1",
    });
  });

  it("answers the same 404 for a missing, foreign or personal booking and for a malformed id", async () => {
    getStudioBookingDetail.mockResolvedValue(null);
    const missing = await call("b-foreign");
    expect(missing.status).toBe(404);
    expect((await json(missing)).error).toMatchObject({ code: "BOOKING_NOT_FOUND", message: "Запись не найдена." });

    getStudioBookingDetail.mockClear();
    const malformed = await call("x".repeat(65));
    expect(malformed.status).toBe(404);
    expect(getStudioBookingDetail).not.toHaveBeenCalled();
  });

  it("refuses a studio master", async () => {
    await expectForbiddenForMaster(() => call("b1"));
  });

  it("hides the cause of a server failure", async () => {
    getStudioBookingDetail.mockRejectedValue(new Error("db down"));
    const res = await call("b1");
    expect(res.status).toBe(500);
    expect((await json(res)).error?.message).toBe("Не удалось загрузить запись. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/studio/booking-options", () => {
  const call = () => getBookingOptions(get("/api/cabinet/studio/booking-options"));

  it("keeps only bookable masters and their offers", async () => {
    loadStudioCabinetShellExtras.mockResolvedValue({
      scheduleMasters: [
        { id: "m1", name: "Марина", avatarUrl: null, rating: 5, reviewsCount: 1, isAvailable: true, serviceIds: ["svc1", "svc-archived"] },
        { id: "m2", name: "Ольга", avatarUrl: null, rating: 0, reviewsCount: 0, isAvailable: false, serviceIds: ["svc1"] },
      ],
      services: [
        {
          id: "svc1",
          name: "Маникюр",
          durationMin: 90,
          priceKopeks: 250000,
          masterIds: ["m1", "m2"],
          masterOffers: [
            { masterId: "m1", durationMin: 60, priceKopeks: 300000 },
            { masterId: "m2", durationMin: 90, priceKopeks: 250000 },
          ],
        },
      ],
    });

    const res = await call();
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual({
      studioId: "studio-1",
      timezone: TZ,
      masters: [{ id: "m1", name: "Марина", avatarUrl: null, serviceIds: ["svc1"] }],
      services: [
        {
          id: "svc1",
          name: "Маникюр",
          durationMin: 90,
          priceKopeks: 250000,
          masterIds: ["m1"],
          masters: [{ masterId: "m1", durationMin: 60, priceKopeks: 300000 }],
        },
      ],
    });
  });

  it("answers 401, 403 and hides a server failure", async () => {
    loadStudioCabinetShellExtras.mockRejectedValue(new Error("db down"));
    const failed = await call();
    expect(failed.status).toBe(500);
    expect((await json(failed)).error?.message).toBe("Не удалось загрузить мастеров и услуги. Попробуйте ещё раз.");

    await expectForbiddenForMaster(call);
    await expectUnauthorized(call);
  });
});

describe("studio notifications", () => {
  const list = (query = "") => getNotifications(get(`/api/cabinet/studio/notifications${query}`));

  beforeEach(() => {
    loadStudioNotificationFeed.mockResolvedValue({
      chip: "team",
      unreadCount: 4,
      needsDecisionCount: 1,
      chipCounts: { all: 30, unread: 4 },
      items: [{ id: "schedule-request:r1", link: "/studio/schedule-requests" }],
      total: 3,
    });
    getStudioNotificationCounts.mockResolvedValue({ unreadCount: 4, needsDecisionCount: 1 });
    markStudioNotificationsRead.mockResolvedValue({ updated: 3, unreadCount: 1, needsDecisionCount: 1 });
  });

  it("lists the studio feed page with a next cursor", async () => {
    const res = await list(`?chip=team&limit=1&cursor=${encodeOffsetCursor(1)}`);
    const body = await json(res);

    expect(res.status).toBe(200);
    expect(loadStudioNotificationFeed).toHaveBeenCalledWith({
      userId: "user-1",
      studioId: "studio-1",
      chip: "team",
      offset: 1,
      limit: 1,
    });
    expect(body.data).toMatchObject({
      timezone: TZ,
      chip: "team",
      unreadCount: 4,
      needsDecisionCount: 1,
      items: [{ id: "schedule-request:r1", link: "/studio/schedule-requests" }],
      nextCursor: encodeOffsetCursor(2),
    });
  });

  it("ends the feed on the last page", async () => {
    const body = await json(await list(`?cursor=${encodeOffsetCursor(2)}`));
    expect(body.data?.nextCursor).toBeNull();
  });

  it("rejects an unknown chip", async () => {
    expect((await list("?chip=cabinets")).status).toBe(400);
  });

  it("refuses a studio master everywhere", async () => {
    await expectForbiddenForMaster(() => list());
    await expectForbiddenForMaster(() => getUnreadCount(get("/api/cabinet/studio/notifications/unread-count")));
    await expectForbiddenForMaster(() =>
      postReadAll(new Request("http://localhost/api/cabinet/studio/notifications/read-all", { method: "POST" })),
    );
    expect(markStudioNotificationsRead).not.toHaveBeenCalled();
  });

  it("returns the studio badge", async () => {
    const res = await getUnreadCount(get("/api/cabinet/studio/notifications/unread-count"));
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ unreadCount: 4, needsDecisionCount: 1 });
    expect(getStudioNotificationCounts).toHaveBeenCalledWith("user-1");
  });

  it("marks only the studio channel read", async () => {
    const res = await postReadAll(
      new Request("http://localhost/api/cabinet/studio/notifications/read-all", { method: "POST" }),
    );
    expect(res.status).toBe(200);
    expect((await json(res)).data).toEqual({ updated: 3, unreadCount: 1, needsDecisionCount: 1 });
    expect(markStudioNotificationsRead).toHaveBeenCalledWith("user-1");
  });

  it("answers 401 without a session", async () => {
    await expectUnauthorized(() =>
      postReadAll(new Request("http://localhost/api/cabinet/studio/notifications/read-all", { method: "POST" })),
    );
  });

  it("hides the cause of server failures", async () => {
    loadStudioNotificationFeed.mockRejectedValue(new Error("db down"));
    getStudioNotificationCounts.mockRejectedValue(new Error("db down"));
    markStudioNotificationsRead.mockRejectedValue(new Error("db down"));

    const feed = await list();
    expect(feed.status).toBe(500);
    expect((await json(feed)).error?.message).toBe("Не удалось загрузить уведомления. Попробуйте ещё раз.");

    const count = await getUnreadCount(get("/api/cabinet/studio/notifications/unread-count"));
    expect(count.status).toBe(500);

    const readAll = await postReadAll(
      new Request("http://localhost/api/cabinet/studio/notifications/read-all", { method: "POST" }),
    );
    expect(readAll.status).toBe(500);
    expect((await json(readAll)).error?.message).toBe(
      "Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.",
    );
  });
});
