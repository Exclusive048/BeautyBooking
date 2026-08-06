import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-10 — шаблон «get → (промах) → compute → set» встречался в четырёх местах
 * и ни в одном не имел замка: на истечении TTL горячего ключа полный пересчёт
 * запускают ВСЕ параллельные запросы. У слотов TTL 120 с, то есть у популярного
 * мастера при 20 rps момент истечения стоит двадцати одинаковых пересчётов.
 *
 * Проверяется не «замок берётся», а три свойства, ради которых он написан
 * именно так, а не иначе.
 */

const store = vi.hoisted(() => new Map<string, unknown>());
const setNx = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  delByPattern: vi.fn(),
  setNx: setNx,
}));

import { withSingleFlight } from "@/lib/cache/single-flight";

const LOCK = "sf:test";
const VALUE_KEY = "test:value";

/** Настоящий `setNx` поверх той же карты — чтобы гонка была настоящей. */
function realSetNx(): void {
  setNx.mockImplementation(async (key: string, value: string) => {
    if (store.has(key)) return false;
    store.set(key, value);
    return true;
  });
}

describe("PERF-10 · single-flight", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    realSetNx();
  });

  it("двадцать параллельных промахов считают ОДИН раз", async () => {
    let computes = 0;
    const compute = async () => {
      computes += 1;
      // Победитель успевает записать значение до того, как проигравшие опросят кэш.
      await new Promise((resolve) => setTimeout(resolve, 10));
      store.set(VALUE_KEY, "computed");
      return "computed";
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        withSingleFlight<string>({
          lockKey: LOCK,
          read: async () => (store.get(VALUE_KEY) as string) ?? null,
          compute,
        })
      )
    );

    expect(results).toEqual(Array(20).fill("computed"));
    expect(computes).toBe(1);
  });

  it("замок снимается и после успеха, и после исключения", async () => {
    await withSingleFlight({ lockKey: LOCK, read: async () => null, compute: async () => "ok" });
    expect(store.has(LOCK)).toBe(false);

    await expect(
      withSingleFlight({
        lockKey: LOCK,
        read: async () => null,
        compute: async () => {
          throw new Error("boom");
        },
      })
    ).rejects.toThrow("boom");
    // Иначе один упавший запрос задержал бы остальных на весь TTL замка.
    expect(store.has(LOCK)).toBe(false);
  });

  it("проигравший, не дождавшийся значения, считает сам — отказа не бывает", async () => {
    // Замок занят, и держатель ничего не пишет.
    store.set(LOCK, "1");
    let computes = 0;

    const value = await withSingleFlight<string>({
      lockKey: LOCK,
      waitMs: 60,
      read: async () => null,
      compute: async () => {
        computes += 1;
        return "fallback";
      },
    });

    expect(value).toBe("fallback");
    expect(computes).toBe(1);
  });

  it("недоступный Redis не добавляет ожидания: считаем немедленно", async () => {
    // Так выглядит brownout — `setNx` отвечает отказом (RES-01), но и замка
    // в кэше не видно. Отличить это от «замок занят» можно только так.
    setNx.mockResolvedValue(false);

    const started = Date.now();
    const value = await withSingleFlight<string>({
      lockKey: LOCK,
      waitMs: 5000,
      read: async () => null,
      compute: async () => "computed",
    });

    expect(value).toBe("computed");
    // Ни одного цикла ожидания: waitMs 5 с, а укладываемся в десятки мс.
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("если значение появилось, пока ждали, — оно и возвращается, без второго счёта", async () => {
    store.set(LOCK, "1");
    let computes = 0;
    setTimeout(() => store.set(VALUE_KEY, "from-winner"), 30);

    const value = await withSingleFlight<string>({
      lockKey: LOCK,
      waitMs: 1000,
      read: async () => (store.get(VALUE_KEY) as string) ?? null,
      compute: async () => {
        computes += 1;
        return "loser-computed";
      },
    });

    expect(value).toBe("from-winner");
    expect(computes).toBe(0);
  });
});
