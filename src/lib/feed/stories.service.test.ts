import { describe, it, expect, vi, beforeEach } from "vitest";

const { portfolioFindMany, systemConfigFindUnique } = vi.hoisted(() => ({
  portfolioFindMany: vi.fn(),
  systemConfigFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portfolioItem: { findMany: portfolioFindMany },
    systemConfig: { findUnique: systemConfigFindUnique },
  },
}));

vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: vi.fn().mockResolvedValue(null),
  withRedisCommandTimeout: vi.fn().mockImplementation(<T,>(_label: string, p: Promise<T>) => p),
}));

vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

import { getActiveStoriesGroups } from "@/lib/feed/stories.service";

type RawItem = {
  id: string;
  mediaUrl: string;
  createdAt: Date;
  masterId: string;
  master: {
    name: string;
    type: "MASTER" | "STUDIO";
    publicUsername: string | null;
    avatarUrl: string | null;
  };
};

function makeItem(overrides: Partial<RawItem> & { id: string; masterId: string; createdAt: Date }): RawItem {
  return {
    mediaUrl: `https://cdn.test/${overrides.id}.jpg`,
    master: {
      name: `Master ${overrides.masterId}`,
      type: "MASTER",
      publicUsername: `m-${overrides.masterId}`,
      avatarUrl: null,
    },
    ...overrides,
  };
}

describe("feed/stories getActiveStoriesGroups", () => {
  beforeEach(() => {
    portfolioFindMany.mockReset();
    systemConfigFindUnique.mockReset();
    systemConfigFindUnique.mockResolvedValue(null); // default: 72h
  });

  it("returns empty groups when no items exist", async () => {
    portfolioFindMany.mockResolvedValue([]);
    const result = await getActiveStoriesGroups();
    expect(result.groups).toEqual([]);
    expect(typeof result.cachedAt).toBe("string");
  });

  it("groups items by masterId and produces correct shape", async () => {
    const now = Date.now();
    portfolioFindMany.mockResolvedValue([
      makeItem({ id: "i1", masterId: "m1", createdAt: new Date(now - 1000) }),
      makeItem({ id: "i2", masterId: "m1", createdAt: new Date(now - 5000) }),
      makeItem({ id: "i3", masterId: "m2", createdAt: new Date(now - 2000) }),
    ]);

    const result = await getActiveStoriesGroups();

    expect(result.groups).toHaveLength(2);
    const m1 = result.groups.find((g) => g.masterId === "m1");
    expect(m1).toBeDefined();
    expect(m1!.items).toHaveLength(2);
    expect(m1!.items.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(m1!.providerName).toBe("Master m1");
    expect(m1!.providerType).toBe("MASTER");
    expect(m1!.username).toBe("m-m1");
    expect(typeof m1!.items[0]!.createdAt).toBe("string"); // ISO string, not Date
  });

  it("sorts groups by latest item createdAt (most recent first)", async () => {
    const now = Date.now();
    portfolioFindMany.mockResolvedValue([
      // m-old has older newest item
      makeItem({ id: "old", masterId: "m-old", createdAt: new Date(now - 60_000) }),
      // m-new has the freshest item
      makeItem({ id: "new", masterId: "m-new", createdAt: new Date(now - 1_000) }),
      // m-mid in the middle
      makeItem({ id: "mid", masterId: "m-mid", createdAt: new Date(now - 30_000) }),
    ]);

    const result = await getActiveStoriesGroups();
    expect(result.groups.map((g) => g.masterId)).toEqual(["m-new", "m-mid", "m-old"]);
  });

  it("caps items per master at 10", async () => {
    const now = Date.now();
    const items: RawItem[] = [];
    for (let i = 0; i < 15; i++) {
      items.push(
        makeItem({
          id: `i${i}`,
          masterId: "m1",
          createdAt: new Date(now - i * 1000),
        }),
      );
    }
    portfolioFindMany.mockResolvedValue(items);

    const result = await getActiveStoriesGroups();
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]!.items).toHaveLength(10);
  });

  it("caps groups at 50 masters", async () => {
    const now = Date.now();
    const items: RawItem[] = [];
    for (let i = 0; i < 60; i++) {
      items.push(
        makeItem({
          id: `i${i}`,
          masterId: `m${i}`,
          createdAt: new Date(now - i * 1000),
        }),
      );
    }
    portfolioFindMany.mockResolvedValue(items);

    const result = await getActiveStoriesGroups();
    expect(result.groups).toHaveLength(50);
  });

  it("passes autoPublishStoriesEnabled=true into the query filter", async () => {
    portfolioFindMany.mockResolvedValue([]);
    await getActiveStoriesGroups();

    expect(portfolioFindMany).toHaveBeenCalledTimes(1);
    const args = portfolioFindMany.mock.calls[0]![0];
    expect(args.where.master).toEqual({
      isPublished: true,
      autoPublishStoriesEnabled: true,
    });
    expect(args.where.isPublic).toBe(true);
  });

  it("uses default 72h lookback when SystemConfig is missing", async () => {
    portfolioFindMany.mockResolvedValue([]);
    const before = Date.now();
    await getActiveStoriesGroups();
    const after = Date.now();

    const args = portfolioFindMany.mock.calls[0]![0];
    const since: Date = args.where.createdAt.gte;
    expect(since).toBeInstanceOf(Date);
    const expectedMs = 72 * 60 * 60 * 1000;
    // Allow a couple of ms drift between call and assertion
    expect(since.getTime()).toBeGreaterThanOrEqual(before - expectedMs - 50);
    expect(since.getTime()).toBeLessThanOrEqual(after - expectedMs + 50);
  });

  it("respects SystemConfig override for lookback hours", async () => {
    systemConfigFindUnique.mockResolvedValue({ value: 24 });
    portfolioFindMany.mockResolvedValue([]);

    const before = Date.now();
    await getActiveStoriesGroups();
    const after = Date.now();

    const args = portfolioFindMany.mock.calls[0]![0];
    const since: Date = args.where.createdAt.gte;
    const expectedMs = 24 * 60 * 60 * 1000;
    expect(since.getTime()).toBeGreaterThanOrEqual(before - expectedMs - 50);
    expect(since.getTime()).toBeLessThanOrEqual(after - expectedMs + 50);
  });

  it("falls back to default lookback if SystemConfig has invalid value", async () => {
    systemConfigFindUnique.mockResolvedValue({ value: "not a number" });
    portfolioFindMany.mockResolvedValue([]);
    await getActiveStoriesGroups();

    const args = portfolioFindMany.mock.calls[0]![0];
    const since: Date = args.where.createdAt.gte;
    const elapsedHours = (Date.now() - since.getTime()) / (60 * 60 * 1000);
    expect(elapsedHours).toBeGreaterThan(70);
    expect(elapsedHours).toBeLessThan(74);
  });

  it("preserves provider type and avatar in group", async () => {
    portfolioFindMany.mockResolvedValue([
      {
        id: "i1",
        masterId: "studio-1",
        mediaUrl: "https://cdn/x.jpg",
        createdAt: new Date(),
        master: {
          name: "Beauty Studio",
          type: "STUDIO" as const,
          publicUsername: "beauty",
          avatarUrl: "https://cdn/avatar.jpg",
        },
      },
    ]);

    const result = await getActiveStoriesGroups();
    expect(result.groups[0]!.providerType).toBe("STUDIO");
    expect(result.groups[0]!.avatarUrl).toBe("https://cdn/avatar.jpg");
  });
});
