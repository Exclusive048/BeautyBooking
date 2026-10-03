import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-PORTFOLIO-ORDER — `GET /api/master/portfolio` (`listMasterPortfolio`)
 * отдаёт работы в порядке показа (`PORTFOLIO_DISPLAY_ORDER`, как каталог и
 * публичная страница), с `sortOrder` каждой работы и `total` — числом всех
 * работ мастера для счётчика лимита.
 */

const providerFindUnique = vi.hoisted(() => vi.fn());
const portfolioFindMany = vi.hoisted(() => vi.fn());
const portfolioCount = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique },
    portfolioItem: { findMany: portfolioFindMany, count: portfolioCount },
  },
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: {} }));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/cities/detect-city", () => ({ detectCityFromAddress: vi.fn() }));
vi.mock("@/lib/feed/stories.service", () => ({ invalidateStoriesCache: vi.fn() }));
vi.mock("@/lib/media/service", () => ({ deleteAssetById: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

import { PORTFOLIO_DISPLAY_ORDER } from "./portfolio-order";
import { listMasterPortfolio } from "./profile.service";

function itemRow(id: string, sortOrder: number) {
  return {
    id,
    mediaUrl: `/api/media/file/${id}`,
    caption: null,
    services: [{ serviceId: "service-1" }],
    globalCategoryId: null,
    categorySource: null,
    inSearch: false,
    isPublic: true,
    createdAt: new Date("2026-10-01T10:00:00.000Z"),
    sortOrder,
  };
}

describe("listMasterPortfolio", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    providerFindUnique.mockResolvedValue({ id: "master-1", type: "MASTER", studioId: null, ownerUserId: "user-1" });
  });

  it("orders by the shared display order and returns sortOrder and total", async () => {
    portfolioFindMany.mockResolvedValue([itemRow("w2", 0), itemRow("w1", 1)]);
    portfolioCount.mockResolvedValue(2);

    const result = await listMasterPortfolio("master-1");

    expect(portfolioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { masterId: "master-1" }, orderBy: PORTFOLIO_DISPLAY_ORDER }),
    );
    expect(portfolioCount).toHaveBeenCalledWith({ where: { masterId: "master-1" } });
    expect(result.total).toBe(2);
    expect(result.items.map((item) => [item.id, item.sortOrder])).toEqual([
      ["w2", 0],
      ["w1", 1],
    ]);
    expect(result.items[0]).toMatchObject({ serviceIds: ["service-1"], createdAt: "2026-10-01T10:00:00.000Z" });
  });

  it("counts every work even when the list is capped", async () => {
    portfolioFindMany.mockResolvedValue([itemRow("w1", 0)]);
    portfolioCount.mockResolvedValue(612);

    const result = await listMasterPortfolio("master-1");

    expect(portfolioFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
    expect(result.total).toBe(612);
  });
});
