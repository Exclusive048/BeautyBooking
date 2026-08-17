import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SEC-04 — платные адресные API Яндекса не должны оплачиваться повторно.
 *
 * `geocode` и `suggest` ходили с `cache: "no-store"`, поэтому один и тот же
 * адрес стоил денег при каждом вводе. Тест держит именно это свойство: второй
 * идентичный запрос обязан обслуживаться без обращения к внешнему API.
 */

const cacheStore = new Map<string, unknown>();
const cacheGet = vi.fn(async (key: string) => cacheStore.get(key) ?? null);
const cacheTtls: number[] = [];
const cacheSet = vi.fn(async (key: string, value: unknown, ttlSeconds: number) => {
  cacheStore.set(key, value);
  cacheTtls.push(ttlSeconds);
});

vi.mock("@/lib/cache/cache", () => ({
  get: (key: string) => cacheGet(key),
  set: (key: string, value: unknown, ttl: number) => cacheSet(key, value, ttl),
}));
vi.mock("@/lib/logging/logger", () => ({ logInfo: vi.fn(), logError: vi.fn() }));
vi.mock("@/lib/env", () => ({
  env: { YANDEX_SUGGEST_API_KEY: "test-suggest-key" },
  isProduction: false,
}));

import { normalizeAddressQuery, ADDRESS_CACHE_TTL_SECONDS } from "./address-cache";
import { suggestAddresses } from "./address-suggest";

function yandexOk(values: string[]) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      results: values.map((value) => ({ address: { formatted_address: value } })),
    }),
  };
}

beforeEach(() => {
  cacheStore.clear();
  cacheTtls.length = 0;
  cacheGet.mockClear();
  cacheSet.mockClear();
  vi.unstubAllGlobals();
});

describe("SEC-04 · normalizeAddressQuery", () => {
  it("регистр и лишние пробелы не порождают отдельный ключ", () => {
    expect(normalizeAddressQuery("  Москва,   Тверская   1 ")).toBe("москва, тверская 1");
    expect(normalizeAddressQuery("МОСКВА, ТВЕРСКАЯ 1")).toBe("москва, тверская 1");
  });
});

describe("SEC-04 · suggestAddresses кэширует ответ платного API", () => {
  it("второй идентичный запрос не ходит во внешний API", async () => {
    const fetchMock = vi.fn(async () => yandexOk(["Москва, Тверская 1"]));
    vi.stubGlobal("fetch", fetchMock);

    const first = await suggestAddresses({ query: "Москва, Тверская 1", limit: 5 });
    const second = await suggestAddresses({ query: "Москва, Тверская 1", limit: 5 });

    expect(first).toEqual([{ value: "Москва, Тверская 1" }]);
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("нормализация работает и на уровне кэша: другой регистр — тот же ключ", async () => {
    const fetchMock = vi.fn(async () => yandexOk(["Москва, Тверская 1"]));
    vi.stubGlobal("fetch", fetchMock);

    await suggestAddresses({ query: "Москва, Тверская 1", limit: 5 });
    await suggestAddresses({ query: "  МОСКВА,  ТВЕРСКАЯ 1  ", limit: 5 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("разный limit — разный ключ: короткий ответ не подменяет длинный", async () => {
    const fetchMock = vi.fn(async () => yandexOk(["А", "Б", "В"]));
    vi.stubGlobal("fetch", fetchMock);

    const two = await suggestAddresses({ query: "тверская", limit: 2 });
    const three = await suggestAddresses({ query: "тверская", limit: 3 });

    expect(two).toHaveLength(2);
    expect(three).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("в имя ключа Redis не попадает сам адрес (это ПДн-содержащая строка)", async () => {
    const fetchMock = vi.fn(async () => yandexOk(["Москва, Тверская 1"]));
    vi.stubGlobal("fetch", fetchMock);

    await suggestAddresses({ query: "Москва, Тверская 1", limit: 5 });

    const keys = [...cacheStore.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/^addr:suggest:v1:[0-9a-f]{64}$/);
    expect(keys[0]).not.toContain("Тверская");
  });

  it("TTL кэша задан и конечен", async () => {
    const fetchMock = vi.fn(async () => yandexOk(["Москва, Тверская 1"]));
    vi.stubGlobal("fetch", fetchMock);

    await suggestAddresses({ query: "тверская", limit: 5 });

    expect(cacheTtls).toEqual([ADDRESS_CACHE_TTL_SECONDS]);
    expect(ADDRESS_CACHE_TTL_SECONDS).toBeGreaterThan(0);
  });

  it("отказ кэша не роняет запрос — адрес важнее экономии", async () => {
    cacheGet.mockRejectedValueOnce(new Error("redis down"));
    const fetchMock = vi.fn(async () => yandexOk(["Москва, Тверская 1"]));
    vi.stubGlobal("fetch", fetchMock);

    await expect(suggestAddresses({ query: "тверская", limit: 5 })).resolves.toEqual([
      { value: "Москва, Тверская 1" },
    ]);
  });
});
