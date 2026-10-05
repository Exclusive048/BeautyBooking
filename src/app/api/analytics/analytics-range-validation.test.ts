import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-POLISH — `/api/analytics/*` (кабинет мастера в вебе и приложении):
 * период «с позже, чем по» — 400 `VALIDATION_ERROR` с русским текстом, а не
 * 500. Гоняются настоящие обработчики и настоящий `resolveRangeWithCompare`;
 * подменены сессия, контекст, тариф и сами отчёты.
 */

const getSessionUser = vi.hoisted(() => vi.fn());
const resolveAnalyticsContext = vi.hoisted(() => vi.fn());
const ensureFeatureAccess = vi.hoisted(() => vi.fn());
const getDashboardKpi = vi.hoisted(() => vi.fn());
const getRevenueTimeline = vi.hoisted(() => vi.fn());
const getBookingsFunnel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser }));
vi.mock("@/features/analytics", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/analytics")>();
  return {
    ...actual,
    resolveAnalyticsContext,
    ensureFeatureAccess,
    getDashboardKpi,
    getRevenueTimeline,
    getBookingsFunnel,
  };
});

import { GET as getDashboard } from "@/app/api/analytics/dashboard/route";
import { GET as getTimeline } from "@/app/api/analytics/revenue/timeline/route";
import { GET as getFunnel } from "@/app/api/analytics/bookings/funnel/route";

const ORDER_MESSAGE = "Начало периода не может быть позже конца. Выберите другие даты.";

function req(path: string) {
  return new Request(`https://example.test${path}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  getSessionUser.mockResolvedValue({ id: "user-1" });
  resolveAnalyticsContext.mockResolvedValue({
    scope: "MASTER",
    providerId: "p1",
    studioId: null,
    studioProviderId: null,
    masterFilterId: null,
    timeZone: "Europe/Moscow",
  });
  ensureFeatureAccess.mockResolvedValue({ planCode: "MASTER_PRO", tier: "PRO", features: {} });
  getDashboardKpi.mockResolvedValue({ kpi: {}, occupancy: {} });
  getRevenueTimeline.mockResolvedValue([]);
  getBookingsFunnel.mockResolvedValue({});
});

describe("период «с» позже «по»", () => {
  it.each([
    ["dashboard", () => getDashboard(req("/api/analytics/dashboard?period=custom&from=2026-10-10&to=2026-10-01"))],
    ["revenue/timeline", () => getTimeline(req("/api/analytics/revenue/timeline?from=2026-10-10&to=2026-10-01"))],
    ["bookings/funnel", () => getFunnel(req("/api/analytics/bookings/funnel?from=2026-10-10&to=2026-10-01"))],
  ])("%s — 400 VALIDATION_ERROR", async (_name, call) => {
    const response = await call();
    expect(response.status).toBe(400);
    const body = (await response.json()) as { ok: boolean; error: { code: string; message: string } };
    expect(body.ok).toBe(false);
    expect(body.error).toMatchObject({ code: "VALIDATION_ERROR", message: ORDER_MESSAGE });
  });

  it("верный период — 200", async () => {
    const response = await getDashboard(req("/api/analytics/dashboard?period=custom&from=2026-10-01&to=2026-10-10"));
    expect(response.status).toBe(200);
  });
});
