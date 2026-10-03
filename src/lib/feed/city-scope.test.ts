import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — город в лентах на уровне сервисов: фильтр `cityId` ложится в
 * `AND` к предикату видимости каталога (а не затирает его вторым ключом
 * `master`), истории города кэшируются отдельно и гасятся вместе с общими.
 *
 * @probe 2026-10-03 — `publishedMasterWhere` возвращал `{ master: { cityId } }`
 *        (без предиката видимости): красный «город — в AND с видимостью».
 *        Возвращено — зелёный.
 * @probe 2026-10-03 — из `invalidateStoriesCache` убрано удаление по
 *        указателю: красный «инвалидация гасит и истории городов».
 *        Возвращено — зелёный.
 */

const spies = vi.hoisted(() => ({ portfolioFindMany: vi.fn(async () => []) }));
const redis = vi.hoisted(() => ({
  values: new Map<string, string>(),
  sets: new Map<string, Set<string>>(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    portfolioItem: { findMany: spies.portfolioFindMany },
    systemConfig: { findUnique: async () => null },
  },
}));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => ({
    get: async (key: string) => redis.values.get(key) ?? null,
    set: async (key: string, value: string) => {
      redis.values.set(key, value);
      return "OK";
    },
    del: async (keys: string | string[]) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        redis.values.delete(key);
        redis.sets.delete(key);
      }
      return 1;
    },
    sAdd: async (key: string, member: string) => {
      const set = redis.sets.get(key) ?? new Set<string>();
      set.add(member);
      redis.sets.set(key, set);
      return 1;
    },
    sMembers: async (key: string) => [...(redis.sets.get(key) ?? [])],
    expire: async () => true,
  }),
  withRedisCommandTimeout: <T>(_label: string, promise: Promise<T>) => promise,
}));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn(), logInfo: vi.fn() }));

import { catalogVisibleProviderWhere } from "@/lib/providers/catalog-visibility";
import { listHomeFeedGroups } from "@/lib/feed/home-feed.service";
import { PUBLISHED_MASTER_WHERE, publishedMasterWhere } from "@/lib/feed/portfolio.service";
import {
  FEED_STORIES_CACHE_KEY,
  FEED_STORIES_CITY_KEYS_INDEX,
  feedStoriesCacheKey,
  getActiveStoriesGroups,
  invalidateStoriesCache,
} from "@/lib/feed/stories.service";

beforeEach(() => {
  spies.portfolioFindMany.mockClear();
  redis.values.clear();
  redis.sets.clear();
});

describe("publishedMasterWhere", () => {
  it("без города — ровно прежний объект", () => {
    expect(publishedMasterWhere()).toBe(PUBLISHED_MASTER_WHERE);
  });

  it("город — в AND с видимостью каталога", () => {
    expect(publishedMasterWhere("c1")).toEqual({
      master: { AND: [catalogVisibleProviderWhere(), { cityId: "c1" }] },
    });
  });
});

describe("listHomeFeedGroups — город", () => {
  it("попадает в выборку работ", async () => {
    await listHomeFeedGroups({ limit: 4, cityId: "c1" });
    const where = (spies.portfolioFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.master).toEqual({ AND: [catalogVisibleProviderWhere(), { cityId: "c1" }] });
    expect(where.isPublic).toBe(true);
  });

  it("без города — прежний предикат", async () => {
    await listHomeFeedGroups({ limit: 4 });
    const where = (spies.portfolioFindMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0].where;
    expect(where.master).toEqual(catalogVisibleProviderWhere());
  });
});

describe("истории города — свой кэш", () => {
  it("город — отдельный ключ и фильтр; общий ключ прежний", async () => {
    await getActiveStoriesGroups();
    await getActiveStoriesGroups({ cityId: "c1" });
    expect(redis.values.has(FEED_STORIES_CACHE_KEY)).toBe(true);
    expect(redis.values.has(feedStoriesCacheKey("c1"))).toBe(true);
    const cityCall = spies.portfolioFindMany.mock.calls[1] as unknown as [
      { where: { master: { AND: unknown[] } } },
    ];
    expect(cityCall[0].where.master.AND).toContainEqual({ cityId: "c1" });
    const globalCall = spies.portfolioFindMany.mock.calls[0] as unknown as [
      { where: { master: { AND: unknown[] } } },
    ];
    expect(globalCall[0].where.master.AND).toHaveLength(2);
  });

  it("инвалидация гасит и истории городов", async () => {
    await getActiveStoriesGroups();
    await getActiveStoriesGroups({ cityId: "c1" });
    await getActiveStoriesGroups({ cityId: "c2" });
    await invalidateStoriesCache();
    expect([...redis.values.keys()]).toEqual([]);
    expect(redis.sets.has(FEED_STORIES_CITY_KEYS_INDEX)).toBe(false);
  });
});
