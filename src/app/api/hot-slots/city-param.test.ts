import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * MOBILE-B1 — `?city=<slug>` у ленты горячих слотов: город сужает выборку
 * правил (`provider.cityId`) и потому входит в ключ кэша; без параметра —
 * прежний запрос и прежний ключ. Моки — как в `feed-cache.test.ts`.
 *
 * @probe 2026-10-03 — из `buildFeedCacheKey` убран суффикс города: красный
 *        «город — в ключе». Возвращено — зелёный.
 */

const state = vi.hoisted(() => ({ limited: false }));
const spies = vi.hoisted(() => ({
  findMany: vi.fn(),
  checkRateLimit: vi.fn(),
}));
const store = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/lib/cache/cache", () => ({
  get: (key: string) => Promise.resolve(store.get(key) ?? null),
  set: (key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string) => {
    spies.checkRateLimit(key);
    return Promise.resolve(state.limited ? { limited: true, retryAfterSeconds: 60 } : { limited: false });
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Пустой набор правил: предмет теста — СКОЛЬКО РАЗ считаем, а не что.
    discountRule: {
      findMany: (...args: unknown[]) => {
        spies.findMany(...args);
        return Promise.resolve([]);
      },
    },
    city: {
      findUnique: async (args: { where: { slug: string } }) =>
        args.where.slug === "kazan"
          ? {
              id: "id-kazan",
              slug: "kazan",
              name: "Казань",
              nameGenitive: null,
              latitude: 0,
              longitude: 0,
              timezone: "Europe/Moscow",
              isActive: true,
            }
          : null,
    },
  },
}));

vi.mock("@/lib/hot-slots/service", () => ({ listHotSlotServices: vi.fn(async () => []) }));
vi.mock("@/lib/hot-slots/eligibility", () => ({ isServiceEligibleForHotRule: vi.fn(() => false) }));
vi.mock("@/lib/hot-slots/runtime", () => ({ resolveDynamicHotSlotPricing: vi.fn(() => ({ isHot: false })) }));
vi.mock("@/lib/schedule/usecases", () => ({ listAvailabilitySlotsPaginated: vi.fn(async () => ({ ok: false })) }));
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logInfo: vi.fn(),
  logError: vi.fn(),
}));
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/alerts", () => ({ sendTelegramAlert: vi.fn() }));

import { GET } from "@/app/api/hot-slots/route";

function call(qs = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/hot-slots${qs}`));
}

function providerAnd(callIndex: number): Array<Record<string, unknown>> {
  const args = spies.findMany.mock.calls[callIndex]![0] as {
    where: { provider: { AND: Array<Record<string, unknown>> } };
  };
  return args.where.provider.AND;
}

beforeEach(() => {
  state.limited = false;
  store.clear();
  spies.findMany.mockClear();
  spies.checkRateLimit.mockClear();
});

describe("MOBILE-B1 · город в ленте горячих слотов", () => {
  it("без города — прежний фильтр и прежний ключ", async () => {
    expect((await call("?limit=5")).status).toBe(200);
    expect(providerAnd(0)[1]).not.toHaveProperty("cityId");
    expect([...store.keys()]).toHaveLength(1);
    expect([...store.keys()][0]).toMatch(/^hot-slots:feed:v1:\d+:\d+:-$/);
  });

  it("город сужает выборку провайдеров", async () => {
    await call("?limit=5&city=kazan");
    expect(providerAnd(0)[1]).toMatchObject({ cityId: "id-kazan" });
  });

  it("город — в ключе: лента города и общая не делят кэш", async () => {
    await call("?limit=5");
    await call("?limit=5&city=kazan");
    await call("?limit=5&city=kazan");
    expect(spies.findMany).toHaveBeenCalledTimes(2);
    expect([...store.keys()].some((key) => key.endsWith(":city=id-kazan"))).toBe(true);
  });

  it("неизвестный город — 400 CITY_NOT_FOUND, расчёта нет", async () => {
    const res = await call("?limit=5&city=atlantis");
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("CITY_NOT_FOUND");
    expect(spies.findMany).not.toHaveBeenCalled();
  });
});
