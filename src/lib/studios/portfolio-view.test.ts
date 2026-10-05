import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-STUDIO-C (§7) — портфолио студии одним чтением: подписи по фото,
 * баннер и главное фото каталога, лимит тарифа вызывающего; баннер в лимит не
 * идёт (как у `enforcePortfolioLimit`).
 */

const mediaAssetFindMany = vi.hoisted(() => vi.fn());
const getStudioPortfolioAttribution = vi.hoisted(() => vi.fn());
const getStudioBannerAssetId = vi.hoisted(() => vi.fn());
const getStudioCatalogCoverAssetId = vi.hoisted(() => vi.fn());
const getCurrentPlan = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({ prisma: { mediaAsset: { findMany: mediaAssetFindMany } } }));
vi.mock("@/lib/studios/portfolio-items", () => ({ getStudioPortfolioAttribution }));
vi.mock("@/lib/studios/banner", () => ({ getStudioBannerAssetId }));
vi.mock("@/lib/studios/catalog-cover", () => ({ getStudioCatalogCoverAssetId }));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan }));

import { loadStudioPortfolioView } from "./portfolio-view";

beforeEach(() => {
  vi.clearAllMocks();
  mediaAssetFindMany.mockResolvedValue([
    { id: "ma-3", createdAt: new Date("2026-10-03T10:00:00Z") },
    { id: "ma-2", createdAt: new Date("2026-10-02T10:00:00Z") },
    { id: "ma-1", createdAt: new Date("2026-10-01T10:00:00Z") },
  ]);
  getStudioPortfolioAttribution.mockResolvedValue({
    items: [{ assetId: "ma-2", performerId: "prov-m1", serviceId: "svc-1" }],
    masters: [{ id: "prov-m1", name: "Анна", serviceIds: ["svc-1"] }],
    services: [{ id: "svc-1", title: "Маникюр" }],
  });
  getStudioBannerAssetId.mockResolvedValue("ma-1");
  getStudioCatalogCoverAssetId.mockResolvedValue("ma-2");
  getCurrentPlan.mockResolvedValue({ features: { maxPortfolioPhotosStudioDesign: 15 } });
});

describe("loadStudioPortfolioView", () => {
  it("фото с подписями, баннер и обложка, лимит без баннера", async () => {
    const view = await loadStudioPortfolioView({ studioProviderId: "prov-s1", userId: "owner-1" });

    expect(mediaAssetFindMany.mock.calls[0]![0].where).toMatchObject({
      entityType: "STUDIO",
      entityId: "prov-s1",
      kind: "PORTFOLIO",
      deletedAt: null,
      status: "READY",
    });
    expect(getCurrentPlan).toHaveBeenCalledWith("owner-1", "STUDIO");
    expect(view.photos).toEqual([
      {
        assetId: "ma-3",
        url: "/api/media/file/ma-3",
        createdAt: "2026-10-03T10:00:00.000Z",
        isBanner: false,
        isCatalogCover: false,
        performerId: null,
        serviceId: null,
      },
      {
        assetId: "ma-2",
        url: "/api/media/file/ma-2",
        createdAt: "2026-10-02T10:00:00.000Z",
        isBanner: false,
        isCatalogCover: true,
        performerId: "prov-m1",
        serviceId: "svc-1",
      },
      {
        assetId: "ma-1",
        url: "/api/media/file/ma-1",
        createdAt: "2026-10-01T10:00:00.000Z",
        isBanner: true,
        isCatalogCover: false,
        performerId: null,
        serviceId: null,
      },
    ]);
    expect(view.masters).toEqual([{ id: "prov-m1", name: "Анна", serviceIds: ["svc-1"] }]);
    expect(view.limit).toEqual({ max: 15, used: 2 });
  });

  it("лимита нет — max null", async () => {
    getCurrentPlan.mockResolvedValue({ features: { maxPortfolioPhotosStudioDesign: null } });
    getStudioBannerAssetId.mockResolvedValue(null);
    const view = await loadStudioPortfolioView({ studioProviderId: "prov-s1", userId: "owner-1" });
    expect(view.limit).toEqual({ max: null, used: 3 });
  });
});
