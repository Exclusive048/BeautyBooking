import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError } from "@/lib/api/errors";

/**
 * MOBILE-MASTER-C — JSON-чтения кабинета мастера для приложения:
 * `GET /api/cabinet/master/{dashboard,bookings,bookings/{id},schedule/week,clients,reviews}`.
 *
 * Сервисы кабинета (их выборки и правила — в собственных тестах) замоканы;
 * здесь — обвязка маршрутов: сессия (401), «не мастер» от
 * `getMasterWorkProfiles` проходит как есть (403), валидация (400 без похода в
 * сервисы), постраничность непрозрачным курсором, форма `data`, личный
 * `no-store` и текст 5xx по канону.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const getMasterWorkProfiles = vi.hoisted(() => vi.fn());
const loadMasterBookingItems = vi.hoisted(() => vi.fn());
const getMasterBookingDetail = vi.hoisted(() => vi.fn());
const getMasterBookingsForKanban = vi.hoisted(() => vi.fn());
const verifyClientKeyToken = vi.hoisted(() => vi.fn());
const getMasterDashboardData = vi.hoisted(() => vi.fn());
const getActionRequiredBookingCountsForMaster = vi.hoisted(() => vi.fn());
const getUnansweredReviewsCountForMaster = vi.hoisted(() => vi.fn());
const loadSchedulePlan = vi.hoisted(() => vi.fn());
const getMasterScheduleWeek = vi.hoisted(() => vi.fn());
const getMasterClientsView = vi.hoisted(() => vi.fn());
const getMasterReviewsView = vi.hoisted(() => vi.fn());
const loadReviewServiceTitles = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/master/access", () => ({ getMasterWorkProfiles }));
vi.mock("@/lib/master/booking-items.service", () => ({ loadMasterBookingItems, getMasterBookingDetail }));
vi.mock("@/lib/master/bookings.service", () => ({ getMasterBookingsForKanban }));
vi.mock("@/lib/master/client-key-token", () => ({ verifyClientKeyToken }));
vi.mock("@/lib/master/dashboard.service", () => ({ getMasterDashboardData }));
vi.mock("@/lib/bookings/counts", () => ({ getActionRequiredBookingCountsForMaster }));
vi.mock("@/lib/reviews/counts", () => ({ getUnansweredReviewsCountForMaster }));
vi.mock("@/lib/schedule/patterns", () => ({ loadSchedulePlan }));
vi.mock("@/lib/master/schedule.service", () => ({ getMasterScheduleWeek }));
vi.mock("@/lib/master/clients-view.service", () => ({ getMasterClientsView }));
vi.mock("@/lib/master/reviews-view.service", () => ({ getMasterReviewsView, loadReviewServiceTitles }));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique: providerFindUnique } } }));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { GET as getDashboard } from "./dashboard/route";
import { GET as getBookings } from "./bookings/route";
import { GET as getBooking } from "./bookings/[id]/route";
import { GET as getScheduleWeek } from "./schedule/week/route";
import { GET as getClients } from "./clients/route";
import { GET as getReviews } from "./reviews/route";

type Body = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

const WORK_PROFILES = {
  personalId: "master-1",
  studioProfiles: [],
  allIds: ["master-1"],
  worksInStudio: false,
};

const req = (path: string) => new Request(`http://localhost${path}`);
const item = (id: string) => ({ id, status: "CONFIRMED", actions: { confirm: false } });

async function read(res: Response): Promise<Body> {
  return (await res.json()) as Body;
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1", roles: ["MASTER"] });
  getMasterWorkProfiles.mockResolvedValue(WORK_PROFILES);
  providerFindUnique.mockResolvedValue({ timezone: "Europe/Moscow" });
  loadMasterBookingItems.mockImplementation(async ({ ids }: { ids: string[] }) => ids.map(item));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("общая обвязка", () => {
  const calls: Array<[string, () => Promise<Response>]> = [
    ["dashboard", () => getDashboard(req("/api/cabinet/master/dashboard"))],
    ["bookings", () => getBookings(req("/api/cabinet/master/bookings"))],
    [
      "bookings/{id}",
      () => getBooking(req("/api/cabinet/master/bookings/bk-1"), { params: Promise.resolve({ id: "bk-1" }) }),
    ],
    ["schedule/week", () => getScheduleWeek(req("/api/cabinet/master/schedule/week"))],
    ["clients", () => getClients(req("/api/cabinet/master/clients"))],
    ["reviews", () => getReviews(req("/api/cabinet/master/reviews"))],
  ];

  it.each(calls)("%s: без сессии — 401 UNAUTHORIZED", async (_name, call) => {
    getSessionUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await read(res)).error?.code).toBe("UNAUTHORIZED");
    expect(getMasterWorkProfiles).not.toHaveBeenCalled();
  });

  it.each(calls)("%s: не мастер — 403 FORBIDDEN как есть", async (_name, call) => {
    getMasterWorkProfiles.mockRejectedValue(new AppError("Недостаточно прав для этого действия.", 403, "FORBIDDEN"));
    const res = await call();
    expect(res.status).toBe(403);
    expect((await read(res)).error).toMatchObject({
      code: "FORBIDDEN",
      message: "Недостаточно прав для этого действия.",
    });
  });
});

describe("GET /api/cabinet/master/dashboard", () => {
  function dashboardData() {
    return {
      master: {
        id: "master-1",
        name: "Мария",
        avatarUrl: null,
        publicUsername: "maria",
        studio: null,
        timezone: "Asia/Yekaterinburg",
      },
      isSolo: true,
      showWorkContext: false,
      kpis: { todayRevenue: 300000, todayBookingsCount: 2 },
      freeSlot: {
        startAtUtc: new Date("2026-10-03T10:00:00Z"),
        endAtUtc: new Date("2026-10-03T11:30:00Z"),
        durationMin: 90,
      },
      todayBookings: [
        { id: "bk-1", isCurrent: true, isNext: false },
        { id: "bk-gone", isCurrent: false, isNext: false },
        { id: "bk-2", isCurrent: false, isNext: true },
      ],
      pendingBookings: [{ id: "bk-3" }],
      unansweredReviews: [
        { id: "rv-1", authorName: "Анна", rating: 4, text: null, createdAt: new Date("2026-10-01T08:00:00Z") },
      ],
    };
  }

  function mockDashboardSides(input: { configuredUntil: string | null }) {
    loadSchedulePlan.mockResolvedValue({ todayKey: "2026-10-03", configuredUntil: input.configuredUntil });
    getActionRequiredBookingCountsForMaster.mockResolvedValue({ total: 4, pendingConfirmation: 3, rescheduleRequests: 1 });
    getUnansweredReviewsCountForMaster.mockResolvedValue(2);
  }

  it("200: записи дня с пометками, внимание, окно, no-store", async () => {
    getMasterDashboardData.mockResolvedValue(dashboardData());
    mockDashboardSides({ configuredUntil: "2026-10-08" });
    loadMasterBookingItems.mockImplementation(async ({ ids }: { ids: string[] }) =>
      ids.filter((id) => id !== "bk-gone").map(item),
    );

    const res = await getDashboard(req("/api/cabinet/master/dashboard"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const data = (await read(res)).data!;

    expect(data.timezone).toBe("Asia/Yekaterinburg");
    expect(data.todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.master).toEqual({
      id: "master-1",
      name: "Мария",
      avatarUrl: null,
      publicUsername: "maria",
      studio: null,
    });
    expect(data.scheduleEndsOn).toBe("2026-10-08");
    expect(data.freeSlot).toEqual({
      startAtUtc: "2026-10-03T10:00:00.000Z",
      endAtUtc: "2026-10-03T11:30:00.000Z",
      durationMin: 90,
    });
    expect(data.today).toEqual([
      { ...item("bk-1"), isCurrent: true, isNext: false },
      { ...item("bk-2"), isCurrent: false, isNext: true },
    ]);
    const attention = data.attention as Record<string, unknown> & { reviews: Array<{ id: string }> };
    expect(attention).toMatchObject({
      bookingsCount: 4,
      pendingConfirmationCount: 3,
      rescheduleRequestsCount: 1,
      unansweredReviewsCount: 2,
      bookings: [item("bk-3")],
    });
    expect(attention.reviews).toHaveLength(1);
    // Публичный токен, а не сырой id (rule 12).
    expect(attention.reviews[0]!.id).not.toBe("rv-1");
    expect(attention.reviews[0]).toMatchObject({
      authorName: "Анна",
      rating: 4,
      text: null,
      createdAt: "2026-10-01T08:00:00.000Z",
    });

    expect(loadMasterBookingItems).toHaveBeenCalledWith(
      expect.objectContaining({ ids: ["bk-1", "bk-gone", "bk-2", "bk-3"], workProfileIds: ["master-1"] }),
    );
  });

  it("график далеко впереди — scheduleEndsOn = null; окна нет — freeSlot = null", async () => {
    getMasterDashboardData.mockResolvedValue({ ...dashboardData(), freeSlot: null });
    mockDashboardSides({ configuredUntil: "2026-12-31" });
    const data = (await read(await getDashboard(req("/api/cabinet/master/dashboard")))).data!;
    expect(data.scheduleEndsOn).toBeNull();
    expect(data.freeSlot).toBeNull();
  });

  it("сбой сервиса — 500 с текстом по канону", async () => {
    getMasterDashboardData.mockRejectedValue(new Error("db down"));
    mockDashboardSides({ configuredUntil: null });
    const res = await getDashboard(req("/api/cabinet/master/dashboard"));
    expect(res.status).toBe(500);
    expect((await read(res)).error).toMatchObject({
      code: "INTERNAL_ERROR",
      message: "Не удалось загрузить главную. Попробуйте ещё раз.",
    });
  });
});

describe("GET /api/cabinet/master/bookings", () => {
  function board() {
    return {
      timezone: "Europe/Moscow",
      showWorkContext: false,
      stats: { total: 4, pendingSum: 500000, confirmedSum: 0 },
      columns: {
        pending: [
          { id: "bk-1", reviewRating: null },
          { id: "bk-2", reviewRating: null },
          { id: "bk-3", reviewRating: null },
        ],
        confirmed: [],
        today: [],
        done: [{ id: "bk-9", reviewRating: 5 }],
        cancelled: [],
      },
    };
  }

  it("колонка по страницам: курсор, total, счётчики всех колонок", async () => {
    getMasterBookingsForKanban.mockResolvedValue(board());
    const first = await getBookings(req("/api/cabinet/master/bookings?limit=2"));
    expect(first.status).toBe(200);
    expect(first.headers.get("Cache-Control")).toBe("private, no-store");
    const firstData = (await read(first)).data!;
    expect(firstData).toMatchObject({
      column: "pending",
      timezone: "Europe/Moscow",
      showWorkContext: false,
      counts: { pending: 3, confirmed: 0, today: 0, done: 1, cancelled: 0 },
      stats: { total: 4, pendingSum: 500000, confirmedSum: 0 },
      total: 3,
    });
    expect((firstData.items as Array<{ id: string }>).map((entry) => entry.id)).toEqual(["bk-1", "bk-2"]);
    expect(typeof firstData.nextCursor).toBe("string");

    const second = await getBookings(
      req(`/api/cabinet/master/bookings?limit=2&cursor=${encodeURIComponent(firstData.nextCursor as string)}`),
    );
    const secondData = (await read(second)).data!;
    expect((secondData.items as Array<{ id: string }>).map((entry) => entry.id)).toEqual(["bk-3"]);
    expect(secondData.nextCursor).toBeNull();
  });

  it("оценка отзыва приходит из канбана", async () => {
    getMasterBookingsForKanban.mockResolvedValue(board());
    const data = (await read(await getBookings(req("/api/cabinet/master/bookings?column=done")))).data!;
    expect(data.items).toEqual([{ ...item("bk-9"), reviewRating: 5 }]);
  });

  it("фильтры уходят в сервис; токен клиента проверяется для личного профиля", async () => {
    getMasterBookingsForKanban.mockResolvedValue(board());
    verifyClientKeyToken.mockReturnValue("user:client-7");
    await getBookings(req("/api/cabinet/master/bookings?q=%D0%90%D0%BD%D0%BD%D0%B0&tab=regular&client=tok"));
    expect(verifyClientKeyToken).toHaveBeenCalledWith({ token: "tok", masterProviderId: "master-1" });
    expect(getMasterBookingsForKanban).toHaveBeenCalledWith(
      expect.objectContaining({
        masterId: "master-1",
        filters: { search: "Анна", tab: "regular", clientKey: "user:client-7" },
      }),
    );
  });

  it("устаревший токен клиента — 400 с понятным текстом, канбан не строится", async () => {
    verifyClientKeyToken.mockReturnValue(null);
    const res = await getBookings(req("/api/cabinet/master/bookings?client=stale"));
    expect(res.status).toBe(400);
    expect((await read(res)).error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Ссылка на историю клиента устарела. Откройте карточку клиента ещё раз.",
    });
    expect(getMasterBookingsForKanban).not.toHaveBeenCalled();
  });

  it("испорченный курсор, неизвестная колонка, limit > 50 — 400 VALIDATION_ERROR", async () => {
    for (const search of ["cursor=Y2t4eXo", "column=archive", "limit=51"]) {
      const res = await getBookings(req(`/api/cabinet/master/bookings?${search}`));
      expect(res.status).toBe(400);
      expect((await read(res)).error?.code).toBe("VALIDATION_ERROR");
    }
    expect(getMasterBookingsForKanban).not.toHaveBeenCalled();
  });

  it("сбой — 500 с текстом по канону", async () => {
    getMasterBookingsForKanban.mockRejectedValue(new Error("db down"));
    const res = await getBookings(req("/api/cabinet/master/bookings"));
    expect(res.status).toBe(500);
    expect((await read(res)).error?.message).toBe("Не удалось загрузить записи. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/master/bookings/{id}", () => {
  const call = (id: string) =>
    getBooking(req(`/api/cabinet/master/bookings/${encodeURIComponent(id)}`), { params: Promise.resolve({ id }) });

  it("своя запись — 200 { booking }", async () => {
    const booking = { ...item("bk-1"), client: { name: "Анна", phone: "+79990000000" } };
    getMasterBookingDetail.mockResolvedValue(booking);
    const res = await call("bk-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect((await read(res)).data).toEqual({ booking });
    expect(getMasterBookingDetail).toHaveBeenCalledWith({ bookingId: "bk-1", workProfiles: WORK_PROFILES });
  });

  it("чужая или несуществующая — 404 BOOKING_NOT_FOUND", async () => {
    getMasterBookingDetail.mockResolvedValue(null);
    const res = await call("bk-foreign");
    expect(res.status).toBe(404);
    expect((await read(res)).error).toMatchObject({ code: "BOOKING_NOT_FOUND", message: "Запись не найдена." });
  });

  it("id невозможной формы — тот же 404 без запроса к БД", async () => {
    const res = await call("x".repeat(65));
    expect(res.status).toBe(404);
    expect((await read(res)).error?.code).toBe("BOOKING_NOT_FOUND");
    expect(getMasterBookingDetail).not.toHaveBeenCalled();
  });

  it("сбой — 500 с текстом по канону", async () => {
    getMasterBookingDetail.mockRejectedValue(new Error("db down"));
    const res = await call("bk-1");
    expect(res.status).toBe(500);
    expect((await read(res)).error?.message).toBe("Не удалось загрузить запись. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/master/schedule/week", () => {
  function week() {
    return {
      timezone: "Europe/Moscow",
      showWorkContext: false,
      hourRange: { start: 9, end: 21 },
      kpi: { weekBookingsCount: 1, loadPct: 10, firstFreeAfter: "12:00" },
      days: [
        {
          iso: "2026-09-28",
          weekDay: { weekday: 1, isToday: false },
          isOff: false,
          workingIntervals: [{ startMin: 600, endMin: 1140 }],
          breaks: [{ startMin: 780, endMin: 840 }],
          fixedStarts: null,
          timeBlocks: [
            {
              id: "tb-1",
              type: "BLOCK",
              note: "Обучение",
              startAtUtc: new Date("2026-09-28T12:00:00Z"),
              endAtUtc: new Date("2026-09-28T13:00:00Z"),
            },
          ],
          bookings: [{ id: "bk-1" }, { id: "bk-gone" }],
        },
        {
          iso: "2026-09-29",
          weekDay: { weekday: 2, isToday: false },
          isOff: true,
          workingIntervals: [],
          breaks: [],
          fixedStarts: ["10:00", "14:00"],
          timeBlocks: [],
          bookings: [],
        },
      ],
    };
  }

  it("без from — понедельник текущей недели САЛОНА", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // Вс 23:30 UTC = пн 02:30 в Москве: неделя салона уже следующая.
    vi.setSystemTime(new Date("2026-10-04T23:30:00Z"));
    getMasterScheduleWeek.mockResolvedValue(week());
    const res = await getScheduleWeek(req("/api/cabinet/master/schedule/week"));
    expect(res.status).toBe(200);
    const data = (await read(res)).data!;
    expect(data.from).toBe("2026-10-05");
    expect(data.todayKey).toBe("2026-10-05");
    const weekStart = getMasterScheduleWeek.mock.calls[0]![0].weekStart as Date;
    expect([weekStart.getFullYear(), weekStart.getMonth() + 1, weekStart.getDate()]).toEqual([2026, 10, 5]);
  });

  it("день: часы, перерывы и блоки в форме приложения, записи — единые элементы", async () => {
    getMasterScheduleWeek.mockResolvedValue(week());
    loadMasterBookingItems.mockImplementation(async ({ ids }: { ids: string[] }) =>
      ids.filter((id) => id !== "bk-gone").map(item),
    );
    const res = await getScheduleWeek(req("/api/cabinet/master/schedule/week?from=2026-09-28"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const data = (await read(res)).data!;
    expect(data).toMatchObject({
      timezone: "Europe/Moscow",
      from: "2026-09-28",
      to: "2026-09-29",
      hourRange: { start: 9, end: 21 },
      kpi: { weekBookingsCount: 1, loadPct: 10, firstFreeAfter: "12:00" },
    });
    expect(data.days).toEqual([
      {
        date: "2026-09-28",
        weekday: 1,
        isToday: false,
        isOff: false,
        workingIntervals: [{ start: "10:00", end: "19:00" }],
        breaks: [{ start: "13:00", end: "14:00" }],
        fixedStarts: null,
        timeBlocks: [
          {
            id: "tb-1",
            type: "BLOCK",
            note: "Обучение",
            startAtUtc: "2026-09-28T12:00:00.000Z",
            endAtUtc: "2026-09-28T13:00:00.000Z",
          },
        ],
        bookings: [item("bk-1")],
      },
      {
        date: "2026-09-29",
        weekday: 2,
        isToday: false,
        isOff: true,
        workingIntervals: [],
        breaks: [],
        fixedStarts: ["10:00", "14:00"],
        timeBlocks: [],
        bookings: [],
      },
    ]);
  });

  it("несуществующая дата и не дата — 400 VALIDATION_ERROR без похода в сервис", async () => {
    for (const from of ["2026-02-31", "2026-13-01", "28.09.2026"]) {
      const res = await getScheduleWeek(req(`/api/cabinet/master/schedule/week?from=${from}`));
      expect(res.status).toBe(400);
      expect((await read(res)).error?.code).toBe("VALIDATION_ERROR");
    }
    expect(getMasterScheduleWeek).not.toHaveBeenCalled();
  });

  it("профиль мастера не найден — 404 MASTER_NOT_FOUND", async () => {
    providerFindUnique.mockResolvedValue(null);
    const res = await getScheduleWeek(req("/api/cabinet/master/schedule/week"));
    expect(res.status).toBe(404);
    expect((await read(res)).error?.code).toBe("MASTER_NOT_FOUND");
  });

  it("сбой — 500 с текстом по канону", async () => {
    getMasterScheduleWeek.mockRejectedValue(new Error("db down"));
    const res = await getScheduleWeek(req("/api/cabinet/master/schedule/week"));
    expect(res.status).toBe(500);
    expect((await read(res)).error?.message).toBe("Не удалось загрузить расписание. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/master/clients", () => {
  function view() {
    return {
      activeTab: "all",
      sort: "recent",
      search: "",
      kpi: {
        totalCount: 3,
        newThisMonthCount: 1,
        totalLtv: 900000,
        avgLtv: 300000,
        avgFrequency: 1.5,
        retentionPct: 33,
      },
      tabCounts: { all: 3, new: 1, regular: 1, vip: 0, sleeping: 1 },
      clients: [{ key: "user:a" }, { key: "user:b" }, { key: "phone:+79990000000" }],
    };
  }

  it("страница клиентов, KPI и счётчики вкладок по всему окну", async () => {
    getMasterClientsView.mockResolvedValue(view());
    const res = await getClients(req("/api/cabinet/master/clients?limit=2"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const data = (await read(res)).data!;
    expect(data).toMatchObject({
      tab: "all",
      sort: "recent",
      q: "",
      kpi: { totalCount: 3, avgFrequency: 1.5 },
      tabCounts: { all: 3, new: 1, regular: 1, vip: 0, sleeping: 1 },
      items: [{ key: "user:a" }, { key: "user:b" }],
      total: 3,
    });
    expect(typeof data.windowMonths).toBe("number");
    expect(typeof data.nextCursor).toBe("string");
  });

  it("сервис получает личный профиль, пояс салона и IP для следа чтения ПДн", async () => {
    getMasterClientsView.mockResolvedValue(view());
    await getClients(req("/api/cabinet/master/clients?q=%2B7999&tab=sleeping&sort=ltv_desc"));
    expect(getMasterClientsView).toHaveBeenCalledWith({
      providerId: "master-1",
      actorUserId: "user-1",
      actorIp: "203.0.113.7",
      workProfiles: WORK_PROFILES,
      timezone: "Europe/Moscow",
      activeTab: "sleeping",
      sort: "ltv_desc",
      search: "+7999",
    });
  });

  it("неизвестная вкладка — 400 VALIDATION_ERROR", async () => {
    const res = await getClients(req("/api/cabinet/master/clients?tab=blocked"));
    expect(res.status).toBe(400);
    expect((await read(res)).error?.code).toBe("VALIDATION_ERROR");
    expect(getMasterClientsView).not.toHaveBeenCalled();
  });

  it("сбой — 500 с текстом по канону", async () => {
    getMasterClientsView.mockRejectedValue(new Error("db down"));
    const res = await getClients(req("/api/cabinet/master/clients"));
    expect(res.status).toBe(500);
    expect((await read(res)).error?.message).toBe("Не удалось загрузить клиентов. Попробуйте ещё раз.");
  });
});

describe("GET /api/cabinet/master/reviews", () => {
  function reviewsView() {
    return {
      activeFilter: "all",
      stats: { totalCount: 2, avgRating: 4.5 },
      filterCounts: { all: 2, unanswered: 1, good: 2, bad: 0 },
      reviews: [
        {
          id: "rv-token-1",
          bookingId: "bk-1",
          rating: 5,
          text: "Отлично",
          authorName: "Анна",
          createdAt: "2026-10-01T08:00:00.000Z",
          replyText: null,
          repliedAt: null,
          reportedAt: null,
          isNew: true,
          targetType: "provider",
          publicTags: [],
          privateTags: undefined,
        },
        {
          id: "rv-token-2",
          bookingId: null,
          rating: 4,
          text: null,
          authorName: "Ольга",
          createdAt: "2026-09-20T08:00:00.000Z",
          replyText: "Спасибо!",
          repliedAt: "2026-09-21T08:00:00.000Z",
          reportedAt: null,
          isNew: false,
          targetType: "studio",
          publicTags: [],
          privateTags: [],
        },
      ],
    };
  }

  it("отзывы: услуга, на чей отзыв отвечать, сводка и счётчики", async () => {
    getMasterReviewsView.mockResolvedValue(reviewsView());
    loadReviewServiceTitles.mockResolvedValue(new Map([["bk-1", "Маникюр"]]));
    const res = await getReviews(req("/api/cabinet/master/reviews"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const data = (await read(res)).data!;
    expect(data).toMatchObject({
      filter: "all",
      stats: { totalCount: 2, avgRating: 4.5 },
      filterCounts: { all: 2, unanswered: 1, good: 2, bad: 0 },
      nextCursor: null,
      total: 2,
    });
    expect(data.items).toEqual([
      expect.objectContaining({
        id: "rv-token-1",
        serviceTitle: "Маникюр",
        canReply: true,
        isStudioVisit: false,
        privateTags: [],
      }),
      expect.objectContaining({
        id: "rv-token-2",
        bookingId: null,
        serviceTitle: null,
        canReply: false,
        isStudioVisit: true,
        replyText: "Спасибо!",
      }),
    ]);
    expect(getMasterReviewsView).toHaveBeenCalledWith(
      expect.objectContaining({ masterProviderId: "master-1", workProfileIds: ["master-1"], filter: "all" }),
    );
  });

  it("неизвестный фильтр и испорченный курсор — 400 VALIDATION_ERROR", async () => {
    for (const search of ["filter=hidden", "cursor=Y2t4eXo"]) {
      const res = await getReviews(req(`/api/cabinet/master/reviews?${search}`));
      expect(res.status).toBe(400);
      expect((await read(res)).error?.code).toBe("VALIDATION_ERROR");
    }
    expect(getMasterReviewsView).not.toHaveBeenCalled();
  });

  it("сбой — 500 с текстом по канону", async () => {
    getMasterReviewsView.mockRejectedValue(new Error("db down"));
    const res = await getReviews(req("/api/cabinet/master/reviews"));
    expect(res.status).toBe(500);
    expect((await read(res)).error?.message).toBe("Не удалось загрузить отзывы. Попробуйте ещё раз.");
  });
});
