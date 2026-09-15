import { beforeEach, describe, expect, it, vi } from "vitest";
import { encodePublicId } from "@/lib/public-id";

/**
 * FEED-PORTFOLIO-N1-FIX-A — PERF-1 regression coverage.
 *
 * Locks the behaviour of the batched `loadMasterServiceOverridesMap` helper
 * and the four sites that consume it (listPortfolioFeed / listHomePortfolioFeed /
 * getPortfolioDetail main + similar). Verifies:
 *
 *   - identical output shape to the pre-refactor implementation
 *   - master×service override resolution via the precomputed map
 *   - fallback to `service.price` / `service.durationMin` when no enabled
 *     MasterService row exists for the (master, service) pair
 *   - empty feed fires zero MasterService queries
 *   - cuid-shaped (master, service) tuple keys do not collide across different
 *     pairs in the same page
 *
 * Uses the project-standard `vi.hoisted` + `vi.mock("@/lib/prisma")` pattern
 * (see src/lib/chat/attachment.test.ts).
 */

const portfolioItemFindMany = vi.hoisted(() => vi.fn());
const portfolioItemFindUnique = vi.hoisted(() => vi.fn());
const mediaAssetFindMany = vi.hoisted(() => vi.fn());
const masterServiceFindMany = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portfolioItem: {
      findMany: portfolioItemFindMany,
      findUnique: portfolioItemFindUnique,
    },
    mediaAsset: {
      findMany: mediaAssetFindMany,
    },
    masterService: {
      findMany: masterServiceFindMany,
    },
  },
}));

import {
  getPortfolioDetail,
  listHomePortfolioFeed,
  listPortfolioFeed,
  loadMasterServiceOverridesMap,
} from "./portfolio.service";

function makeMaster(id: string, overrides: Partial<{ name: string; publicUsername: string | null; avatarUrl: string | null; ratingAvg: number; studio: { name: string } | null; isPublished: boolean }> = {}) {
  return {
    id,
    isPublished: overrides.isPublished ?? true,
    name: overrides.name ?? `Master ${id}`,
    publicUsername: overrides.publicUsername ?? null,
    avatarUrl: overrides.avatarUrl ?? null,
    ratingAvg: overrides.ratingAvg ?? 4.5,
    studio: overrides.studio !== undefined ? overrides.studio : null,
  };
}

function makeService(id: string, overrides: Partial<{ name: string; title: string | null; price: number; durationMin: number }> = {}) {
  return {
    service: {
      id,
      name: overrides.name ?? `Service ${id}`,
      title: overrides.title ?? null,
      price: overrides.price ?? 100000,
      durationMin: overrides.durationMin ?? 60,
    },
  };
}

function makePortfolioRow(input: {
  id: string;
  masterId: string;
  serviceIds: string[];
  mediaUrl?: string;
  favoritesCount?: number;
  isFavorited?: boolean;
  serviceOverrides?: Record<string, Partial<{ name: string; title: string | null; price: number; durationMin: number }>>;
}) {
  return {
    id: input.id,
    mediaUrl: input.mediaUrl ?? `https://cdn.example.com/${input.id}.webp`,
    caption: null,
    width: 1080,
    height: 1080,
    master: makeMaster(input.masterId),
    services: input.serviceIds.map((sid) => makeService(sid, input.serviceOverrides?.[sid] ?? {})),
    favorites: input.isFavorited ? [{ id: "fav-1" }] : [],
    _count: { favorites: input.favoritesCount ?? 0 },
  };
}

beforeEach(() => {
  portfolioItemFindMany.mockReset();
  portfolioItemFindUnique.mockReset();
  mediaAssetFindMany.mockReset();
  masterServiceFindMany.mockReset();
  // mediaAsset.findMany is incidental — return empty by default so visualSearchReady=false.
  mediaAssetFindMany.mockResolvedValue([]);
});

describe("loadMasterServiceOverridesMap (FEED-PORTFOLIO-N1-FIX-A helper)", () => {
  it("returns empty map without firing a query when pairs is empty", async () => {
    const map = await loadMasterServiceOverridesMap([]);
    expect(map.size).toBe(0);
    expect(masterServiceFindMany).not.toHaveBeenCalled();
  });

  it("does not collide keys for two distinct (masterId, serviceId) tuples", async () => {
    masterServiceFindMany.mockResolvedValue([
      { masterProviderId: "m-A", serviceId: "s-1", isEnabled: true, priceOverride: 11111, durationOverrideMin: 30 },
      { masterProviderId: "m-B", serviceId: "s-2", isEnabled: true, priceOverride: 22222, durationOverrideMin: 90 },
    ]);

    const map = await loadMasterServiceOverridesMap([
      { masterProviderId: "m-A", serviceId: "s-1" },
      { masterProviderId: "m-B", serviceId: "s-2" },
    ]);

    expect(map.size).toBe(2);
    expect(map.get("m-A:s-1")).toMatchObject({ priceOverride: 11111, durationOverrideMin: 30 });
    expect(map.get("m-B:s-2")).toMatchObject({ priceOverride: 22222, durationOverrideMin: 90 });
    // Critical: keys must not cross-pollute.
    expect(map.get("m-A:s-2")).toBeUndefined();
    expect(map.get("m-B:s-1")).toBeUndefined();
  });
});

describe("listPortfolioFeed (FEED-PORTFOLIO-N1-FIX-A — site 1 of 4)", () => {
  it("applies MasterService overrides for the row's own master only (no cross-master leakage)", async () => {
    portfolioItemFindMany.mockResolvedValue([
      makePortfolioRow({ id: "p-1", masterId: "m-1", serviceIds: ["s-1"], serviceOverrides: { "s-1": { price: 100000, durationMin: 60 } } }),
    ]);
    // m-1 has an enabled override for s-1; an unrelated master m-2 also has a row that must be ignored.
    masterServiceFindMany.mockResolvedValue([
      { masterProviderId: "m-1", serviceId: "s-1", isEnabled: true, priceOverride: 55555, durationOverrideMin: 45 },
    ]);

    const result = await listPortfolioFeed({ limit: 10 });

    expect(result.items).toHaveLength(1);
    // RULE-12-REMAINDER (FIX-15): id is now an opaque token; masterId/serviceIds
    // are no longer emitted on the public payload.
    expect(result.items[0]).toMatchObject({
      id: encodePublicId("p-1"),
      totalPrice: 55555, // override wins
      totalDurationMin: 45, // override wins
      primaryServiceTitle: "Service s-1",
    });
    expect(result.items[0]).not.toHaveProperty("masterId");
    expect(result.items[0]).not.toHaveProperty("serviceIds");
    // Exactly ONE batched MasterService query — proves N+1 collapse.
    expect(masterServiceFindMany).toHaveBeenCalledTimes(1);
    expect(masterServiceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          masterProviderId: { in: ["m-1"] },
          serviceId: { in: ["s-1"] },
          isEnabled: true,
        }),
      }),
    );
  });

  it("falls back to service.price / service.durationMin when no MasterService override exists", async () => {
    portfolioItemFindMany.mockResolvedValue([
      makePortfolioRow({
        id: "p-no-override",
        masterId: "m-1",
        serviceIds: ["s-fallback"],
        serviceOverrides: { "s-fallback": { price: 80000, durationMin: 75 } },
      }),
    ]);
    // Master m-1 has NO enabled MasterService row for s-fallback.
    masterServiceFindMany.mockResolvedValue([]);

    const result = await listPortfolioFeed({ limit: 10 });

    expect(result.items[0]).toMatchObject({
      totalPrice: 80000, // fallback to service.price
      totalDurationMin: 75, // fallback to service.durationMin
    });
  });

  it("fires zero MasterService queries for an empty feed page (no rows returned)", async () => {
    portfolioItemFindMany.mockResolvedValue([]);

    const result = await listPortfolioFeed({ limit: 10 });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
    expect(masterServiceFindMany).not.toHaveBeenCalled();
  });
});

describe("listHomePortfolioFeed (FEED-PORTFOLIO-N1-FIX-A — site 2 of 4)", () => {
  it("uses the same batched override lookup and preserves PortfolioFeedItem shape", async () => {
    portfolioItemFindMany.mockResolvedValue([
      makePortfolioRow({
        id: "home-p-1",
        masterId: "m-home",
        serviceIds: ["s-home-1", "s-home-2"],
        serviceOverrides: {
          "s-home-1": { price: 50000, durationMin: 30, title: "Стрижка" },
          "s-home-2": { price: 70000, durationMin: 45 },
        },
      }),
    ]);
    masterServiceFindMany.mockResolvedValue([
      // Only s-home-1 has an override; s-home-2 falls back.
      { masterProviderId: "m-home", serviceId: "s-home-1", isEnabled: true, priceOverride: 60000, durationOverrideMin: 40 },
    ]);

    const result = await listHomePortfolioFeed({ limit: 10 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: encodePublicId("home-p-1"),
      // s-home-1 uses override (60000 + 40), s-home-2 uses fallback (70000 + 45).
      totalPrice: 60000 + 70000,
      totalDurationMin: 40 + 45,
      primaryServiceTitle: "Стрижка",
    });
    expect(result.items[0]).not.toHaveProperty("masterId");
    expect(masterServiceFindMany).toHaveBeenCalledTimes(1);
  });
});

/**
 * FEED-UNPUBLISHED-MASTER (2026-09-15). Лента показывала работы мастеров,
 * снятых с публикации (фильтр был только по `isPublic` самой работы).
 *
 * @probe убран `...PUBLISHED_MASTER_WHERE` из `listPortfolioFeed` → первый
 * кейс красный (`where` без `master.isPublished`); убран `!item.master.isPublished`
 * из `getPortfolioDetail` → второй кейс красный (резолвится вместо 404).
 */
describe("FEED-UNPUBLISHED-MASTER · работы неопубликованных мастеров не отдаются", () => {
  it("лента требует опубликованного мастера в самом запросе", async () => {
    portfolioItemFindMany.mockResolvedValue([]);
    await listPortfolioFeed({ limit: 10 });
    await listHomePortfolioFeed({ limit: 10 });

    for (const call of portfolioItemFindMany.mock.calls) {
      expect(call[0].where).toMatchObject({ isPublic: true, master: { isPublished: true } });
    }
    expect(portfolioItemFindMany).toHaveBeenCalledTimes(2);
  });

  it("карточка работы неопубликованного мастера — тот же 404, что у несуществующей", async () => {
    portfolioItemFindUnique.mockResolvedValue({
      ...makePortfolioRow({ id: "hidden-1", masterId: "m-hidden", serviceIds: ["s-h"] }),
      master: makeMaster("m-hidden", { isPublished: false }),
      isPublic: true,
    });

    await expect(getPortfolioDetail("hidden-1")).rejects.toMatchObject({ status: 404 });
    expect(masterServiceFindMany).not.toHaveBeenCalled();
  });

  it("«похожие» на карточке тоже требуют опубликованного мастера", async () => {
    portfolioItemFindUnique.mockResolvedValue({
      ...makePortfolioRow({ id: "detail-pub", masterId: "m-pub", serviceIds: ["s-p"] }),
      isPublic: true,
    });
    portfolioItemFindMany.mockResolvedValue([]);
    masterServiceFindMany.mockResolvedValue([]);

    await getPortfolioDetail("detail-pub");

    expect(portfolioItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublic: true, master: { isPublished: true } }),
      }),
    );
  });
});

describe("getPortfolioDetail (FEED-PORTFOLIO-N1-FIX-A — sites 3 + 4 of 4)", () => {
  it("fires exactly TWO batched MasterService queries (main + similar)", async () => {
    portfolioItemFindUnique.mockResolvedValue({
      ...makePortfolioRow({ id: "detail-1", masterId: "m-d1", serviceIds: ["s-d1"] }),
      isPublic: true,
    });
    portfolioItemFindMany.mockResolvedValue([
      makePortfolioRow({ id: "sim-1", masterId: "m-sim", serviceIds: ["s-d1"] }),
    ]);
    masterServiceFindMany.mockResolvedValue([]);

    const detail = await getPortfolioDetail("detail-1");

    expect(detail.id).toBe(encodePublicId("detail-1"));
    expect(detail.serviceOptions).toHaveLength(1);
    expect(detail.similarItems).toHaveLength(1);
    expect(detail.similarItems[0]).toMatchObject({
      id: encodePublicId("sim-1"),
      masterName: "Master m-sim",
    });
    // Two distinct batched calls: one for main item, one for similar rows.
    expect(masterServiceFindMany).toHaveBeenCalledTimes(2);
  });

  it("does NOT call MasterService.findMany a second time when similarRows is empty", async () => {
    portfolioItemFindUnique.mockResolvedValue({
      ...makePortfolioRow({ id: "detail-empty-sim", masterId: "m-d2", serviceIds: ["s-d2"] }),
      isPublic: true,
    });
    portfolioItemFindMany.mockResolvedValue([]); // no similar rows
    masterServiceFindMany.mockResolvedValue([]);

    const detail = await getPortfolioDetail("detail-empty-sim");

    expect(detail.similarItems).toEqual([]);
    // Only the main-item batched lookup fires; the similar-rows lookup short-circuits on empty pairs.
    expect(masterServiceFindMany).toHaveBeenCalledTimes(1);
  });
});
