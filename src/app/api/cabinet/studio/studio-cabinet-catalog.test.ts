import { beforeEach, describe, expect, it, vi } from "vitest";
import { StudioRole } from "@prisma/client";
import { AppError } from "@/lib/api/errors";
import { encodeOffsetCursor } from "@/lib/pagination/offset-cursor";

/**
 * MOBILE-STUDIO-C (каталог) — JSON-чтения кабинета студии для приложения:
 * `GET /api/cabinet/studio/{services,services/{id},service-packages,clients,
 * clients/{clientKey},reviews,analytics,portfolio}`.
 *
 * Сервисы кабинета замоканы (их правила — в собственных тестах); доступ —
 * настоящий `requireStudioCabinetAdmin` поверх `resolveCurrentStudioAccess`.
 * Здесь — обвязка: 401, 403 мастеру студии, валидация (400 без похода в
 * сервисы), постраничность непрозрачным курсором, форма `data`, `no-store` и
 * текст 5xx без причины.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveCurrentStudioAccess = vi.hoisted(() => vi.fn());
const providerFindUnique = vi.hoisted(() => vi.fn());
const listAvailableCategoriesForStudio = vi.hoisted(() => vi.fn());
const loadStudioServicesKpis = vi.hoisted(() => vi.fn());
const loadStudioServicesListData = vi.hoisted(() => vi.fn());
const loadStudioServiceDetail = vi.hoisted(() => vi.fn());
const listMasterServicePackages = vi.hoisted(() => vi.fn());
const loadStudioClientsPage = vi.hoisted(() => vi.fn());
const loadStudioClientDetail = vi.hoisted(() => vi.fn());
const loadStudioReviewsSet = vi.hoisted(() => vi.fn());
const loadStudioReviewsStats = vi.hoisted(() => vi.fn());
const getStudioAnalyticsFeatures = vi.hoisted(() => vi.fn());
const loadStudioAnalyticsView = vi.hoisted(() => vi.fn());
const loadStudioPortfolioView = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/lib/studio/current", () => ({ resolveCurrentStudioAccess }));
vi.mock("@/lib/prisma", () => ({ prisma: { provider: { findUnique: providerFindUnique } } }));
vi.mock("@/features/studio-cabinet/services/server/services-data.service", () => ({
  listAvailableCategoriesForStudio,
  loadStudioServicesKpis,
  loadStudioServicesListData,
  loadStudioServiceDetail,
}));
vi.mock("@/lib/master/services-view.service", () => ({ listMasterServicePackages }));
vi.mock("@/features/studio-cabinet/clients/server/clients-data.service", () => ({
  loadStudioClientsPage,
  loadStudioClientDetail,
}));
vi.mock("@/features/studio-cabinet/reviews/server/reviews-data.service", () => ({ loadStudioReviewsSet }));
vi.mock("@/features/studio-cabinet/reviews/server/reviews-stats.service", () => ({ loadStudioReviewsStats }));
vi.mock("@/features/studio-cabinet/analytics/server/analytics-features", () => ({ getStudioAnalyticsFeatures }));
vi.mock("@/features/studio-cabinet/analytics/server/analytics-view.service", () => ({ loadStudioAnalyticsView }));
vi.mock("@/features/analytics/domain/guards", () => ({
  FEATURE_REQUIRED_PLAN: {
    analytics_dashboard: "FREE",
    analytics_revenue: "PRO",
    analytics_clients: "PRO",
    analytics_booking_insights: "PRO",
    analytics_cohorts: "PREMIUM",
    analytics_forecast: "PREMIUM",
  },
}));
vi.mock("@/lib/studios/portfolio-view", () => ({ loadStudioPortfolioView }));
vi.mock("@/lib/http/ip", () => ({ extractClientIp: () => "203.0.113.7" }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn(), getRequestId: () => "req" }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportMessage: vi.fn() }));

import { GET as getServices } from "./services/route";
import { GET as getService } from "./services/[id]/route";
import { GET as getPackages } from "./service-packages/route";
import { GET as getClients } from "./clients/route";
import { GET as getClient } from "./clients/[clientKey]/route";
import { GET as getReviews } from "./reviews/route";
import { GET as getAnalytics } from "./analytics/route";
import { GET as getPortfolio } from "./portfolio/route";

type Body = {
  ok: boolean;
  data?: Record<string, unknown>;
  error?: { code: string; message: string };
};

const req = (path: string) => new Request(`http://localhost${path}`);
const params = <T extends Record<string, string>>(value: T) => ({ params: Promise.resolve(value) });

async function read(res: Response): Promise<Body> {
  return (await res.json()) as Body;
}

const MASTER_CHIP = { id: "prov-m1", displayName: "Анна", avatarUrl: null };

const SERVICE_ITEM = {
  id: "svc-1",
  name: "Маникюр",
  durationMin: 60,
  priceKopeks: 150_000,
  categoryId: "gc-1",
  isActive: true,
  onlinePaymentEnabled: false,
  sortOrder: 0,
  bookings30d: 4,
  mastersCount: 1,
  masters: [MASTER_CHIP],
};

const CLIENT_ROW = {
  key: "phone:+79990000001",
  clientUserId: null,
  displayName: "Гость",
  phone: "+79990000001",
  visitsCount: 2,
  mastersCount: 1,
  lifetimeKopeks: 300_000,
  avgCheckKopeks: 150_000,
  lastVisitAt: "2026-09-30T09:00:00.000Z",
  lastVisitDaysAgo: 4,
  mainMaster: MASTER_CHIP,
  segments: ["regular"],
  primarySegment: "regular",
};

const REVIEW_ITEM = (id: string) => ({
  id,
  clientName: "Мария",
  rating: 5,
  createdAt: "2026-10-01T12:00:00.000Z",
  dateLabel: "вчера",
  master: { id: "prov-m1", displayName: "Анна" },
  serviceName: "Маникюр",
  bookingId: `b-${id}`,
  text: "Спасибо!",
  reply: null,
  canReply: true,
  isReported: false,
});

const KPI = { value: 1, previous: null, deltaPct: null };

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1", roles: ["STUDIO"] });
  resolveCurrentStudioAccess.mockResolvedValue({
    studioId: "studio-1",
    providerId: "prov-s1",
    roles: [StudioRole.OWNER],
  });
  providerFindUnique.mockResolvedValue({ timezone: "Asia/Yekaterinburg" });

  listAvailableCategoriesForStudio.mockResolvedValue([{ id: "gc-1", name: "Маникюр", icon: "💅", status: "APPROVED" }]);
  loadStudioServicesKpis.mockResolvedValue({
    totalServices: 1,
    totalCategories: 1,
    popularServiceName: "Маникюр",
    popularBookings30d: 4,
    averageCheckKopeks: 150_000,
    servicesWithoutMaster: 0,
  });
  loadStudioServicesListData.mockResolvedValue({
    categories: [{ id: "gc-1", title: "Маникюр", icon: "💅", servicesCount: 1, status: "APPROVED" }],
    items: [SERVICE_ITEM],
    selectedCategoryId: null,
    totalServices: 1,
  });
  loadStudioServiceDetail.mockResolvedValue({
    ...SERVICE_ITEM,
    description: "Классический",
    assignedMasters: [MASTER_CHIP],
    availableMasters: [],
    stats30d: { bookingsCount: 4, revenueKopeks: 600_000 },
  });
  listMasterServicePackages.mockResolvedValue([{ id: "pkg-1" }]);
  loadStudioClientsPage.mockResolvedValue({
    items: [CLIENT_ROW, { ...CLIENT_ROW, key: "user:u-2", clientUserId: "u-2", phone: "—" }],
    segmentCounts: { all: 2, vip: 0, regular: 2, new: 0, sleeping: 0 },
    kpis: { total: { count: 2, addedThisMonth: 0 } },
    totalCount: 2,
    total: 2,
    nextCursor: null,
    timezone: "Asia/Yekaterinburg",
    masterOptions: [MASTER_CHIP],
  });
  loadStudioClientDetail.mockResolvedValue({
    timezone: "Asia/Yekaterinburg",
    client: { key: "user:u-2", displayName: "Мария" },
    nextBooking: {
      id: "bk-9",
      startAtUtc: "2026-10-06T08:00:00.000Z",
      status: "CONFIRMED",
      serviceName: "Маникюр",
      master: null,
    },
    recentVisits: [
      {
        bookingId: "bk-1",
        startAtUtc: "2026-09-30T09:00:00.000Z",
        serviceName: "Маникюр",
        amountKopeks: 150_000,
        master: { id: "prov-m1", displayName: "Анна" },
      },
    ],
  });
  loadStudioReviewsSet.mockResolvedValue({
    items: [REVIEW_ITEM("r-1"), REVIEW_ITEM("r-2"), REVIEW_ITEM("r-3")],
    filterCounts: { all: 3, no_reply: 3, low_rating: 0, five_star: 3 },
    masterOptions: [{ id: "prov-m1", displayName: "Анна" }],
    totalReviewsCount: 3,
    unansweredCount: 3,
  });
  loadStudioReviewsStats.mockResolvedValue({
    averageRating: 5,
    totalReviews: 3,
    positivePercent: 100,
    distribution: [],
    topServicesByReviews: [],
  });
  getStudioAnalyticsFeatures.mockResolvedValue({
    dashboard: true,
    revenue: true,
    clients: true,
    bookingInsights: false,
    cohorts: false,
  });
  loadStudioAnalyticsView.mockImplementation(async (input: { view: string; compare: boolean; features: unknown }) => ({
    period: "30d",
    periodLabel: "05 сентября — 04 октября 2026",
    view: input.view,
    compare: input.compare,
    features: input.features,
    kpi: { revenue: KPI, bookings: KPI, avgCheck: KPI, occupancy: KPI, returnRate: KPI },
    overview: null,
    masters: null,
    services: null,
    clients:
      input.view === "clients"
        ? { segments: [], topClients: [{ clientKey: "u-7", displayName: "Мария", visitsCount: 3, lifetimeKopeks: 450_000 }] }
        : null,
  }));
  loadStudioPortfolioView.mockResolvedValue({
    photos: [
      {
        assetId: "ma-1",
        url: "/api/media/file/ma-1",
        createdAt: "2026-10-01T10:00:00.000Z",
        isBanner: false,
        isCatalogCover: true,
        performerId: "prov-m1",
        serviceId: "svc-1",
      },
    ],
    masters: [],
    services: [],
    limit: { max: 15, used: 1 },
  });
});

const CALLS: Array<[string, () => Promise<Response>, () => void]> = [
  ["services", () => getServices(req("/api/cabinet/studio/services")), () => loadStudioServicesKpis.mockRejectedValue(new Error("db down"))],
  [
    "services/{id}",
    () => getService(req("/api/cabinet/studio/services/svc-1"), params({ id: "svc-1" })),
    () => loadStudioServiceDetail.mockRejectedValue(new Error("db down")),
  ],
  [
    "service-packages",
    () => getPackages(req("/api/cabinet/studio/service-packages")),
    () => listMasterServicePackages.mockRejectedValue(new Error("db down")),
  ],
  ["clients", () => getClients(req("/api/cabinet/studio/clients")), () => loadStudioClientsPage.mockRejectedValue(new Error("db down"))],
  [
    "clients/{clientKey}",
    () => getClient(req("/api/cabinet/studio/clients/user%3Au-2"), params({ clientKey: "user:u-2" })),
    () => loadStudioClientDetail.mockRejectedValue(new Error("db down")),
  ],
  ["reviews", () => getReviews(req("/api/cabinet/studio/reviews")), () => loadStudioReviewsStats.mockRejectedValue(new Error("db down"))],
  ["analytics", () => getAnalytics(req("/api/cabinet/studio/analytics")), () => loadStudioAnalyticsView.mockRejectedValue(new Error("db down"))],
  ["portfolio", () => getPortfolio(req("/api/cabinet/studio/portfolio")), () => loadStudioPortfolioView.mockRejectedValue(new Error("db down"))],
];

const FAILURE_MESSAGES: Record<string, string> = {
  services: "Не удалось загрузить услуги. Попробуйте ещё раз.",
  "services/{id}": "Не удалось загрузить услугу. Попробуйте ещё раз.",
  "service-packages": "Не удалось загрузить пакеты. Попробуйте ещё раз.",
  clients: "Не удалось загрузить клиентов. Попробуйте ещё раз.",
  "clients/{clientKey}": "Не удалось загрузить карточку клиента. Попробуйте ещё раз.",
  reviews: "Не удалось загрузить отзывы. Попробуйте ещё раз.",
  analytics: "Не удалось загрузить аналитику. Попробуйте ещё раз.",
  portfolio: "Не удалось загрузить портфолио. Попробуйте ещё раз.",
};

describe("общая обвязка", () => {
  it.each(CALLS)("%s: без сессии — 401 UNAUTHORIZED", async (_name, call) => {
    getSessionUser.mockResolvedValue(null);
    const res = await call();
    expect(res.status).toBe(401);
    expect((await read(res)).error?.code).toBe("UNAUTHORIZED");
    expect(resolveCurrentStudioAccess).not.toHaveBeenCalled();
  });

  it.each(CALLS)("%s: мастер студии — 403 FORBIDDEN", async (_name, call) => {
    resolveCurrentStudioAccess.mockResolvedValue({
      studioId: "studio-1",
      providerId: "prov-s1",
      roles: [StudioRole.MASTER],
    });
    const res = await call();
    expect(res.status).toBe(403);
    expect((await read(res)).error).toMatchObject({
      code: "FORBIDDEN",
      message: "Этот раздел доступен владельцу студии.",
    });
  });

  it.each(CALLS)("%s: ответ личный — no-store", async (_name, call) => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it.each(CALLS)("%s: сбой сервера — 500 без причины", async (name, call, breakIt) => {
    breakIt();
    const res = await call();
    const body = await read(res);
    expect(res.status).toBe(500);
    expect(body.error).toMatchObject({ code: "INTERNAL_ERROR", message: FAILURE_MESSAGES[name] });
    expect(JSON.stringify(body)).not.toContain("db down");
  });
});

describe("GET /api/cabinet/studio/services", () => {
  it("весь прайс: категории с именами, globalCategoryId, KPI и варианты выбора", async () => {
    const body = await read(await getServices(req("/api/cabinet/studio/services?q=%20ман")));
    expect(loadStudioServicesListData).toHaveBeenCalledWith({
      studioId: "studio-1",
      currentUserId: "user-1",
      categoryId: null,
      search: "ман",
      categoryFallback: "all",
    });
    expect(body.data).toMatchObject({
      categoryId: null,
      q: "ман",
      categories: [{ id: "gc-1", name: "Маникюр", icon: "💅", status: "APPROVED", servicesCount: 1 }],
      pickerCategories: [{ id: "gc-1", name: "Маникюр" }],
      kpis: { totalServices: 1, averageCheckKopeks: 150_000 },
    });
    expect((body.data?.items as unknown[])[0]).toEqual({
      id: "svc-1",
      name: "Маникюр",
      durationMin: 60,
      priceKopeks: 150_000,
      globalCategoryId: "gc-1",
      isActive: true,
      onlinePaymentEnabled: false,
      sortOrder: 0,
      bookings30d: 4,
      mastersCount: 1,
      masters: [MASTER_CHIP],
    });
  });

  it("слишком длинный поиск — 400 без похода в сервисы", async () => {
    const res = await getServices(req(`/api/cabinet/studio/services?q=${"а".repeat(81)}`));
    expect(res.status).toBe(400);
    expect((await read(res)).error?.code).toBe("VALIDATION_ERROR");
    expect(loadStudioServicesListData).not.toHaveBeenCalled();
  });
});

describe("GET /api/cabinet/studio/services/{id}", () => {
  it("карточка: описание, мастера, статистика 30 дней", async () => {
    const body = await read(await getService(req("/api/cabinet/studio/services/svc-1"), params({ id: "svc-1" })));
    expect(loadStudioServiceDetail).toHaveBeenCalledWith({ studioId: "studio-1", serviceId: "svc-1" });
    expect(body.data?.service).toMatchObject({
      id: "svc-1",
      globalCategoryId: "gc-1",
      description: "Классический",
      assignedMasters: [MASTER_CHIP],
      availableMasters: [],
      stats30d: { bookingsCount: 4, revenueKopeks: 600_000 },
    });
  });

  it("чужая или несуществующая — 404 SERVICE_NOT_FOUND", async () => {
    loadStudioServiceDetail.mockResolvedValue(null);
    const res = await getService(req("/api/cabinet/studio/services/svc-x"), params({ id: "svc-x" }));
    expect(res.status).toBe(404);
    expect((await read(res)).error).toMatchObject({ code: "SERVICE_NOT_FOUND", message: "Услуга не найдена." });
  });

  it("несуразный id — 404 без похода в базу", async () => {
    const id = "x".repeat(65);
    const res = await getService(req(`/api/cabinet/studio/services/${id}`), params({ id }));
    expect(res.status).toBe(404);
    expect(loadStudioServiceDetail).not.toHaveBeenCalled();
  });
});

describe("GET /api/cabinet/studio/service-packages", () => {
  it("пакеты студии — по Provider студии, по прайсу студии", async () => {
    const body = await read(await getPackages(req("/api/cabinet/studio/service-packages")));
    expect(listMasterServicePackages).toHaveBeenCalledWith("prov-s1", { useBasePrice: true });
    expect(body.data).toEqual({ packages: [{ id: "pkg-1" }] });
  });
});

describe("GET /api/cabinet/studio/clients", () => {
  it("страница по смещению, эхо фильтров, телефон «—» — null", async () => {
    const cursor = encodeOffsetCursor(30);
    const body = await read(
      await getClients(req(`/api/cabinet/studio/clients?segment=regular&q=Гость&master=all&cursor=${cursor}&limit=10`)),
    );
    expect(loadStudioClientsPage).toHaveBeenCalledWith({
      studioId: "studio-1",
      actorUserId: "user-1",
      actorIp: "203.0.113.7",
      segment: "regular",
      search: "Гость",
      masterId: undefined,
      offset: 30,
      limit: 10,
    });
    expect(body.data).toMatchObject({
      windowMonths: 24,
      timezone: "Asia/Yekaterinburg",
      segment: "regular",
      q: "Гость",
      master: null,
      segmentCounts: { all: 2 },
      masterOptions: [MASTER_CHIP],
      nextCursor: null,
      total: 2,
      totalCount: 2,
    });
    const items = body.data?.items as Array<{ key: string; phone: string | null }>;
    expect(items.map((i) => i.phone)).toEqual(["+79990000001", null]);
  });

  it("по мастеру и с лимитом по умолчанию", async () => {
    await getClients(req("/api/cabinet/studio/clients?master=prov-m1"));
    expect(loadStudioClientsPage).toHaveBeenCalledWith(expect.objectContaining({ masterId: "prov-m1", offset: 0, limit: 30 }));
  });

  it("испорченный курсор — 400 «Список обновился…» без похода в сервис", async () => {
    const res = await getClients(req("/api/cabinet/studio/clients?cursor=broken"));
    expect(res.status).toBe(400);
    expect((await read(res)).error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Список обновился. Загрузите его заново.",
    });
    expect(loadStudioClientsPage).not.toHaveBeenCalled();
  });

  it("неизвестный сегмент — 400", async () => {
    const res = await getClients(req("/api/cabinet/studio/clients?segment=blacklist"));
    expect(res.status).toBe(400);
    expect(loadStudioClientsPage).not.toHaveBeenCalled();
  });
});

describe("GET /api/cabinet/studio/clients/{clientKey}", () => {
  it("сводка с мобильными ссылками на записи", async () => {
    const body = await read(
      await getClient(req("/api/cabinet/studio/clients/user%3Au-2"), params({ clientKey: "user%3Au-2" })),
    );
    expect(loadStudioClientDetail).toHaveBeenCalledWith({
      studioId: "studio-1",
      actorUserId: "user-1",
      actorIp: "203.0.113.7",
      clientKey: "user:u-2",
    });
    expect(body.data).toMatchObject({
      windowMonths: 24,
      timezone: "Asia/Yekaterinburg",
      client: { key: "user:u-2" },
      nextBooking: { id: "bk-9", href: "/studio/bookings/bk-9", master: null },
      recentVisits: [{ bookingId: "bk-1", href: "/studio/bookings/bk-1", amountKopeks: 150_000 }],
    });
  });

  it("клиента нет у студии — 404 NOT_FOUND", async () => {
    loadStudioClientDetail.mockResolvedValue(null);
    const res = await getClient(req("/api/cabinet/studio/clients/user%3Ax"), params({ clientKey: "user:x" }));
    expect(res.status).toBe(404);
    expect((await read(res)).error).toMatchObject({ code: "NOT_FOUND", message: "Клиент не найден." });
  });

  it("неверный ключ — 400 CLIENT_KEY_INVALID как есть", async () => {
    loadStudioClientDetail.mockRejectedValue(
      new AppError("Карточка клиента не открылась. Вернитесь к списку клиентов.", 400, "CLIENT_KEY_INVALID"),
    );
    const res = await getClient(req("/api/cabinet/studio/clients/oops"), params({ clientKey: "%E0%A4%A" }));
    expect(res.status).toBe(400);
    expect((await read(res)).error?.code).toBe("CLIENT_KEY_INVALID");
    expect(loadStudioClientDetail).toHaveBeenCalledWith(expect.objectContaining({ clientKey: "" }));
  });
});

describe("GET /api/cabinet/studio/reviews", () => {
  it("статистика, счётчики и страница без подписи даты", async () => {
    const body = await read(await getReviews(req("/api/cabinet/studio/reviews?filter=no_reply&master=prov-m1&limit=2")));
    expect(loadStudioReviewsSet).toHaveBeenCalledWith({
      studioId: "studio-1",
      currentUserId: "user-1",
      filter: "no_reply",
      masterId: "prov-m1",
    });
    expect(loadStudioReviewsStats).toHaveBeenCalledWith("studio-1");
    expect(body.data).toMatchObject({
      filter: "no_reply",
      master: "prov-m1",
      stats: { averageRating: 5 },
      filterCounts: { all: 3 },
      unansweredCount: 3,
      totalReviewsCount: 3,
      total: 3,
    });
    const items = body.data?.items as Array<Record<string, unknown>>;
    expect(items.map((i) => i.id)).toEqual(["r-1", "r-2"]);
    expect(items[0]).not.toHaveProperty("dateLabel");
    expect(items[0]).toMatchObject({ canReply: true, isReported: false, reply: null, bookingId: "b-r-1" });
    expect(typeof body.data?.nextCursor).toBe("string");

    const next = await read(
      await getReviews(req(`/api/cabinet/studio/reviews?limit=2&cursor=${body.data?.nextCursor as string}`)),
    );
    expect((next.data?.items as Array<{ id: string }>).map((i) => i.id)).toEqual(["r-3"]);
    expect(next.data?.nextCursor).toBeNull();
  });

  it("неизвестный фильтр — 400", async () => {
    const res = await getReviews(req("/api/cabinet/studio/reviews?filter=worst"));
    expect(res.status).toBe(400);
    expect(loadStudioReviewsSet).not.toHaveBeenCalled();
  });
});

describe("GET /api/cabinet/studio/analytics", () => {
  it("365d — годовой период веба, эхо 365d; замки по тарифу", async () => {
    const body = await read(await getAnalytics(req("/api/cabinet/studio/analytics?period=365d&compare=off")));
    expect(loadStudioAnalyticsView).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", period: "year", view: "overview", compare: false }),
    );
    expect(body.data).toMatchObject({
      period: "365d",
      view: "overview",
      compare: false,
      timezone: "Asia/Yekaterinburg",
      locks: {
        revenue: null,
        clients: null,
        bookingInsights: {
          code: "FEATURE_GATE",
          message: "Этот отчёт недоступен на вашем тарифе.",
          details: { feature: "analytics_booking_insights", requiredPlan: "PRO" },
        },
      },
    });
  });

  it("топ клиентов — ключи карточки клиента", async () => {
    const body = await read(await getAnalytics(req("/api/cabinet/studio/analytics?view=clients")));
    expect(body.data?.clients).toEqual({
      segments: [],
      topClients: [{ clientKey: "user:u-7", displayName: "Мария", visitsCount: 3, lifetimeKopeks: 450_000 }],
    });
  });

  it("неизвестный период — 400", async () => {
    const res = await getAnalytics(req("/api/cabinet/studio/analytics?period=year"));
    expect(res.status).toBe(400);
    expect(loadStudioAnalyticsView).not.toHaveBeenCalled();
  });
});

describe("GET /api/cabinet/studio/portfolio", () => {
  it("фото, Provider студии и лимит", async () => {
    const body = await read(await getPortfolio(req("/api/cabinet/studio/portfolio")));
    expect(loadStudioPortfolioView).toHaveBeenCalledWith({ studioProviderId: "prov-s1", userId: "user-1" });
    expect(body.data).toMatchObject({
      providerId: "prov-s1",
      timezone: "Asia/Yekaterinburg",
      photos: [{ assetId: "ma-1", isCatalogCover: true }],
      limit: { max: 15, used: 1 },
    });
  });
});
