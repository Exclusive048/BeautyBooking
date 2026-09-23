import { describe, it, expect, vi, beforeEach } from "vitest";
import { MediaEntityType, MediaKind } from "@prisma/client";

/**
 * SECURITY-EXPOSURE-AUDIT-01 #3 — the public-visibility predicate that decides
 * whether an anonymous caller may read a MASTER/STUDIO portfolio asset. Pins the
 * three negative cases that used to leak: hidden item, unpublished provider, and
 * a delete-orphaned asset (no public PortfolioItem).
 */

const { providerFindUnique, portfolioFindFirst } = vi.hoisted(() => ({
  providerFindUnique: vi.fn(),
  portfolioFindFirst: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    provider: { findUnique: providerFindUnique },
    portfolioItem: { findFirst: portfolioFindFirst },
  },
}));
vi.mock("@/lib/media/access", () => ({
  canManageProvider: vi.fn(),
  ensureCanManageMedia: vi.fn(),
  ensureCanReadMedia: vi.fn(),
}));
vi.mock("@/lib/billing/get-current-plan", () => ({ getCurrentPlan: vi.fn() }));
vi.mock("@/lib/billing/guards", () => ({ createLimitReachedError: vi.fn() }));
vi.mock("@/lib/media/storage", () => ({ getStorageProvider: vi.fn() }));
vi.mock("@/lib/advisor/cache", () => ({ invalidateAdvisorCache: vi.fn() }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { isProviderMediaPubliclyVisible } from "@/lib/media/service";

const PORTFOLIO_ASSET = {
  id: "asset1",
  entityType: MediaEntityType.MASTER,
  entityId: "provider1",
  kind: MediaKind.PORTFOLIO,
};

beforeEach(() => {
  providerFindUnique.mockReset();
  portfolioFindFirst.mockReset();
});

describe("isProviderMediaPubliclyVisible", () => {
  it("PORTFOLIO on a PUBLISHED provider with a PUBLIC item → visible", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: true });
    portfolioFindFirst.mockResolvedValue({ id: "item1" });
    expect(await isProviderMediaPubliclyVisible(PORTFOLIO_ASSET)).toBe(true);
  });

  it("PORTFOLIO on an UNPUBLISHED provider → NOT visible (never queries the item)", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: false });
    expect(await isProviderMediaPubliclyVisible(PORTFOLIO_ASSET)).toBe(false);
    expect(portfolioFindFirst).not.toHaveBeenCalled();
  });

  it("PORTFOLIO on a DELETED provider (row absent) → NOT visible", async () => {
    providerFindUnique.mockResolvedValue(null);
    expect(await isProviderMediaPubliclyVisible(PORTFOLIO_ASSET)).toBe(false);
  });

  it("PORTFOLIO published but NO public item (hidden/orphaned) → NOT visible", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: true });
    portfolioFindFirst.mockResolvedValue(null);
    expect(await isProviderMediaPubliclyVisible(PORTFOLIO_ASSET)).toBe(false);
  });

  // STUDIO-PHOTOS-PUBLIC-01: у студии строк работ нет вовсе, поэтому правило
  // «нужна публичная работа» не выполнялось никогда и все фото студии были 403.
  //
  // @probe 2026-09-23 — ветка STUDIO убрана из `isProviderMediaPubliclyVisible`
  // (студия снова идёт по правилу мастера): красный «STUDIO … без строк работ →
  // visible». Возвращено — зелёный.
  it("STUDIO PORTFOLIO on a PUBLISHED studio without any item rows → visible", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: true });
    portfolioFindFirst.mockResolvedValue(null);
    expect(
      await isProviderMediaPubliclyVisible({ ...PORTFOLIO_ASSET, entityType: MediaEntityType.STUDIO }),
    ).toBe(true);
  });

  it("STUDIO PORTFOLIO on an UNPUBLISHED studio → NOT visible", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: false });
    expect(
      await isProviderMediaPubliclyVisible({ ...PORTFOLIO_ASSET, entityType: MediaEntityType.STUDIO }),
    ).toBe(false);
  });

  it("STUDIO PORTFOLIO referenced by a HIDDEN item → NOT visible", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: true });
    portfolioFindFirst.mockResolvedValue({ id: "hidden-item" });
    expect(
      await isProviderMediaPubliclyVisible({ ...PORTFOLIO_ASSET, entityType: MediaEntityType.STUDIO }),
    ).toBe(false);
  });

  it("AVATAR is public regardless of provider state (no DB lookup)", async () => {
    expect(
      await isProviderMediaPubliclyVisible({ ...PORTFOLIO_ASSET, kind: MediaKind.AVATAR })
    ).toBe(true);
    expect(providerFindUnique).not.toHaveBeenCalled();
  });

  it("SITE assets are public (admin-managed)", async () => {
    expect(
      await isProviderMediaPubliclyVisible({
        ...PORTFOLIO_ASSET,
        entityType: MediaEntityType.SITE,
        entityId: "site",
      })
    ).toBe(true);
  });

  it("matches the PortfolioItem by mediaUrl contains assetId", async () => {
    providerFindUnique.mockResolvedValue({ isPublished: true });
    portfolioFindFirst.mockResolvedValue({ id: "item1" });
    await isProviderMediaPubliclyVisible(PORTFOLIO_ASSET);
    expect(portfolioFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublic: true, mediaUrl: { contains: "asset1" } }),
      })
    );
  });
});
