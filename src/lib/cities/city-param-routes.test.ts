import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBILE-B1 — `?city=<slug>` у публичных JSON-эндпоинтов, зависящих от города.
 *
 * Настоящие здесь обработчики, схемы и резолв города (`server-city.ts`);
 * подменены БД городов, кука, сессия, лимитер и сервисы выдачи — предмет теста
 * то, КАКОЙ город доходит до сервиса, и что без параметра всё как раньше.
 *
 * @probe 2026-10-03 — в `/api/catalog/search` `resolveRequestCity(citySlug)`
 *        заменён на `resolveRequestCity(undefined)` (только кука): красные
 *        «параметр главнее куки» и «неизвестный город — 400». Возвращено — зелёный.
 * @probe 2026-10-03 — из `feedPortfolioCacheKey` убран суффикс города:
 *        красный «город — в ключе кэша». Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({ cookie: undefined as string | undefined }));
const spies = vi.hoisted(() => ({
  searchCatalog: vi.fn(async () => ({ items: [] })),
  listHomeFeedGroups: vi.fn(async () => ({ groups: [], nextCursor: null })),
  listPortfolioFeed: vi.fn(async () => ({ items: [], nextCursor: null })),
  getActiveStoriesGroups: vi.fn(async () => ({ groups: [], cachedAt: "now" })),
  searchAvailabilityByTime: vi.fn(async () => ({ items: [] })),
  listPublicModelOffers: vi.fn(async () => ({ items: [] })),
  providerFindMany: vi.fn(async () => []),
}));
const redisStore = vi.hoisted(() => new Map<string, string>());

const CITIES: Record<string, { isActive: boolean }> = { kazan: { isActive: true }, moskva: { isActive: true } };

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (name === "mr-city-slug" && state.cookie ? { value: state.cookie } : undefined),
  }),
  headers: async () => new Headers(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    city: {
      findUnique: async (args: { where: { slug: string } }) => {
        const row = CITIES[args.where.slug];
        return row
          ? {
              id: `id-${args.where.slug}`,
              slug: args.where.slug,
              name: args.where.slug,
              nameGenitive: null,
              latitude: 0,
              longitude: 0,
              timezone: "Europe/Moscow",
              isActive: row.isActive,
            }
          : null;
      },
    },
    globalCategory: { findMany: async () => [] },
    provider: { findMany: spies.providerFindMany },
  },
}));

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: async () => ({ limited: false }) }));
vi.mock("@/lib/auth/session", () => ({ getSessionUser: async () => null }));
vi.mock("@/lib/redis/connection", () => ({
  getRedisConnection: async () => ({
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: string) => {
      redisStore.set(key, value);
      return "OK";
    },
  }),
  withRedisCommandTimeout: <T>(_label: string, promise: Promise<T>) => promise,
}));
vi.mock("@/lib/catalog/catalog.service", () => ({ searchCatalog: spies.searchCatalog }));
vi.mock("@/lib/feed/home-feed.service", () => ({ listHomeFeedGroups: spies.listHomeFeedGroups }));
vi.mock("@/lib/feed/portfolio.service", () => ({ listPortfolioFeed: spies.listPortfolioFeed }));
vi.mock("@/lib/feed/stories.service", () => ({ getActiveStoriesGroups: spies.getActiveStoriesGroups }));
vi.mock("@/lib/search-by-time/service", () => ({ searchAvailabilityByTime: spies.searchAvailabilityByTime }));
vi.mock("@/lib/model-offers/public.service", () => ({ listPublicModelOffers: spies.listPublicModelOffers }));

import { GET as catalogSearch } from "@/app/api/catalog/search/route";
import { GET as catalogAutocomplete } from "@/app/api/catalog/autocomplete/route";
import { GET as feedHome } from "@/app/api/feed/home/route";
import { GET as feedPortfolio } from "@/app/api/feed/portfolio/route";
import { GET as feedStories } from "@/app/api/feed/stories/route";
import { GET as availability } from "@/app/api/search/availability/route";
import { GET as modelOffers } from "@/app/api/public/model-offers/route";

const get = (handler: (req: Request) => Promise<Response>, path: string) =>
  handler(new Request(`https://example.test${path}`));

function lastArg(spy: { mock: { calls: unknown[][] } }): Record<string, unknown> {
  const calls = spy.mock.calls;
  return calls[calls.length - 1]![0] as Record<string, unknown>;
}

beforeEach(() => {
  state.cookie = undefined;
  redisStore.clear();
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe("/api/catalog/search — параметр главнее куки", () => {
  it("без параметра и куки — все города (cityId не задан)", async () => {
    expect((await get(catalogSearch, "/api/catalog/search")).status).toBe(200);
    expect(lastArg(spies.searchCatalog).cityId).toBeUndefined();
    expect(lastArg(spies.searchCatalog)).not.toHaveProperty("city");
  });

  it("кука — как на вебе", async () => {
    state.cookie = "moskva";
    await get(catalogSearch, "/api/catalog/search");
    expect(lastArg(spies.searchCatalog).cityId).toBe("id-moskva");
  });

  it("параметр главнее куки", async () => {
    state.cookie = "moskva";
    await get(catalogSearch, "/api/catalog/search?city=kazan");
    expect(lastArg(spies.searchCatalog).cityId).toBe("id-kazan");
  });

  it("неизвестный город — 400 CITY_NOT_FOUND, выдача не считается", async () => {
    const res = await get(catalogSearch, "/api/catalog/search?city=atlantis");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CITY_NOT_FOUND");
    expect(spies.searchCatalog).not.toHaveBeenCalled();
  });
});

describe("ленты — `city` сужает выдачу; без него как раньше", () => {
  it("/api/feed/home", async () => {
    await get(feedHome, "/api/feed/home");
    expect(lastArg(spies.listHomeFeedGroups).cityId).toBeUndefined();
    await get(feedHome, "/api/feed/home?city=kazan");
    expect(lastArg(spies.listHomeFeedGroups).cityId).toBe("id-kazan");
  });

  it("/api/feed/home игнорирует куку (веб не скоупит ленту городом)", async () => {
    state.cookie = "moskva";
    await get(feedHome, "/api/feed/home");
    expect(lastArg(spies.listHomeFeedGroups).cityId).toBeUndefined();
  });

  it("/api/feed/stories", async () => {
    await get(feedStories, "/api/feed/stories");
    expect(lastArg(spies.getActiveStoriesGroups).cityId).toBeUndefined();
    await get(feedStories, "/api/feed/stories?city=kazan");
    expect(lastArg(spies.getActiveStoriesGroups).cityId).toBe("id-kazan");
  });

  it("/api/feed/portfolio: город — в сервисе и в ключе кэша анонимной ленты", async () => {
    await get(feedPortfolio, "/api/feed/portfolio?limit=10");
    await get(feedPortfolio, "/api/feed/portfolio?limit=10&city=kazan");
    expect(lastArg(spies.listPortfolioFeed).cityId).toBe("id-kazan");
    expect(spies.listPortfolioFeed).toHaveBeenCalledTimes(2);
    expect([...redisStore.keys()].sort()).toEqual([
      "feed:portfolio:cursor=first:limit=10",
      "feed:portfolio:cursor=first:limit=10:city=id-kazan",
    ]);
  });

  it("неизвестный город в ленте — 400 CITY_NOT_FOUND", async () => {
    for (const [handler, path] of [
      [feedHome, "/api/feed/home?city=atlantis"],
      [feedPortfolio, "/api/feed/portfolio?city=atlantis"],
      [feedStories, "/api/feed/stories?city=atlantis"],
      [availability, "/api/search/availability?city=atlantis"],
    ] as const) {
      const res = await get(handler, path);
      expect(res.status, path).toBe(400);
      expect((await res.json()).error.code, path).toBe("CITY_NOT_FOUND");
    }
  });
});

describe("/api/search/availability", () => {
  it("город доходит до сервиса как cityId", async () => {
    await get(availability, "/api/search/availability?serviceId=s1&date=2026-10-05&city=kazan");
    expect(lastArg(spies.searchAvailabilityByTime).cityId).toBe("id-kazan");
  });
});

describe("/api/public/model-offers — прежний смысл `city` сохранён", () => {
  it("slug активного города — фильтр по cityId", async () => {
    await get(modelOffers, "/api/public/model-offers?city=kazan");
    expect(lastArg(spies.listPublicModelOffers)).toMatchObject({ cityId: "id-kazan", city: undefined });
  });

  it("не-slug (название из citySuggestions) — поиск по адресу, как раньше", async () => {
    await get(modelOffers, "/api/public/model-offers?city=%D0%9A%D0%B0%D0%B7%D0%B0%D0%BD%D1%8C");
    expect(lastArg(spies.listPublicModelOffers)).toMatchObject({ city: "Казань" });
    expect(lastArg(spies.listPublicModelOffers).cityId).toBeUndefined();
  });
});

describe("/api/catalog/autocomplete — `city` как синоним `citySlug`", () => {
  it("фильтр подсказок мастеров по slug города", async () => {
    await get(catalogAutocomplete, "/api/catalog/autocomplete?q=an&city=kazan");
    const where = (lastArg(spies.providerFindMany).where ?? {}) as Record<string, unknown>;
    expect(where.city).toEqual({ slug: "kazan" });
  });

  it("при обоих — `city` главнее", async () => {
    await get(catalogAutocomplete, "/api/catalog/autocomplete?q=an&citySlug=moskva&city=kazan");
    const where = (lastArg(spies.providerFindMany).where ?? {}) as Record<string, unknown>;
    expect(where.city).toEqual({ slug: "kazan" });
  });
});
