import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * SEC-15 — лента горячих слотов не пересчитывается на каждый запрос.
 *
 * Обработчик прогонял вложенный цикл «каждый провайдер со скидочным правилом ×
 * каждая подходящая услуга × до 14 дней», материализовывал весь набор,
 * сортировал в памяти и отдавал срез. Пагинация по курсору пересчитывала ВСЁ
 * заново. Ни auth, ни собственного лимита, ни кэша: дешёвый анонимный запрос
 * покупал дорогую работу, растущую линейно с числом провайдеров.
 *
 * Тест держит три свойства: расчёт кэшируется; кэш нельзя обойти бесплатно
 * параметрами, которые ни на что не влияют; свой тир существует и отсекает.
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

beforeEach(() => {
  state.limited = false;
  store.clear();
  spies.findMany.mockClear();
  spies.checkRateLimit.mockClear();
});

describe("SEC-15 · расчёт ленты кэшируется", () => {
  it("второй одинаковый запрос не запускает расчёт заново", async () => {
    expect((await call("?limit=5")).status).toBe(200);
    expect((await call("?limit=5")).status).toBe(200);
    expect(spies.findMany).toHaveBeenCalledTimes(1);
  });

  it("пагинация по курсору не пересчитывает ленту", async () => {
    await call("?limit=5");
    await call("?limit=5&cursor=whatever");
    expect(spies.findMany).toHaveBeenCalledTimes(1);
  });

  it("кэш нельзя обойти неиспользуемыми параметрами — иначе фикс отменяет сам себя", async () => {
    await call("?limit=5");
    await call("?limit=5&tag=random-1");
    await call("?limit=5&geo=random-2");
    expect(spies.findMany).toHaveBeenCalledTimes(1);
  });

  it("category влияет на результат — и потому обязана быть в ключе", async () => {
    await call("?limit=5&category=manicure");
    await call("?limit=5&category=lashes");
    expect(spies.findMany).toHaveBeenCalledTimes(2);
  });
});

describe("SEC-15 · собственный тир", () => {
  it("лимит спрашивается по своему ключу, а не по общему публичному", async () => {
    await call("?limit=5");
    expect(spies.checkRateLimit).toHaveBeenCalledTimes(1);
    expect(spies.checkRateLimit.mock.calls[0][0]).toMatch(/^rl:hot-slots:feed:/);
  });

  it("при срабатывании тира расчёт не запускается вовсе", async () => {
    state.limited = true;
    const res = await call("?limit=5");
    expect(res.status).toBe(429);
    expect(spies.findMany).not.toHaveBeenCalled();
  });
});
