import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * PERF-10 — шаблон «get → (промах) → compute → set» встречался в четырёх местах
 * и ни в одном не имел замка: на истечении TTL горячего ключа полный пересчёт
 * запускают ВСЕ параллельные запросы. У слотов TTL 120 с, то есть у популярного
 * мастера при 20 rps момент истечения стоит двадцати одинаковых пересчётов.
 *
 * Проверяется не «замок берётся», а три свойства, ради которых он написан
 * именно так, а не иначе.
 *
 * 🔴 **Недоступность зависимости здесь НЕ моделируется — и это осознанно**
 * (FIX-C11). Прежняя редакция этого файла содержала тест «недоступный Redis не
 * добавляет ожидания», который моделировал обрыв как `setNx.mockResolvedValue(false)`.
 * Такого поведения у зависимости нет: `setNx` при истёкшей команде **бросает**
 * (`redisClient.ts:141-144`), и это утверждали ДВА других зелёных теста
 * одновременно с этим — `redis-client-timeout.test.ts:77` и
 * `silent-redis-behaviour.test.ts:151`. Пара-противоречие внутри одного репозитория,
 * обе половины зелёные, дефект живой: воронка отвечала 500.
 *
 * Мок фасада кэша выразить настоящий отказ не может по построению, поэтому
 * обрыв проверяется на стенде и через НАСТОЯЩИЙ стек — `single-flight-outage.test.ts`
 * (`lib/testing/silent-redis.ts`). Здесь остаются только свойства замка при
 * ЖИВОЙ зависимости.
 */

const store = vi.hoisted(() => new Map<string, unknown>());
const claimLock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/cache/cache", () => ({
  get: vi.fn(async (key: string) => (store.has(key) ? store.get(key) : null)),
  set: vi.fn(async (key: string, value: unknown) => {
    store.set(key, value);
  }),
  del: vi.fn(async (key: string) => {
    store.delete(key);
  }),
  delByPattern: vi.fn(),
  claimLock,
}));

import { withSingleFlight } from "@/lib/cache/single-flight";

const LOCK = "sf:test";
const VALUE_KEY = "test:value";

/** Настоящий claim поверх той же карты — чтобы гонка была настоящей. */
function realClaimLock(): void {
  claimLock.mockImplementation(async (key: string, value: string) => {
    if (store.has(key)) return { status: "held" };
    store.set(key, value);
    return { status: "acquired" };
  });
}

describe("PERF-10 · single-flight", () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    realClaimLock();
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

  it("замок занят, но держателя не видно — считаем немедленно, без ожидания", async () => {
    // Настоящая гонка со снятием: `claimLock` увидел ключ, а к моменту
    // перечитывания держателя его уже сняли. Ждать некого.
    //
    // ⚠️ Это НЕ модель обрыва Redis: обрыв приходит третьим состоянием
    // (`status: "unavailable"`) и проверяется на стенде в
    // `single-flight-outage.test.ts`. Раньше здесь стоял именно такой тест с
    // `setNx → false`, и он утверждал про зависимость неправду.
    claimLock.mockResolvedValue({ status: "held" });

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

  it("🔴 третье состояние: замок недоступен — работа делается, отказа не бывает", async () => {
    // Поведенческая половина FIX-C11 на уровне мока: `unavailable` обязан вести
    // к расчёту, а не к исключению и не к ожиданию. Настоящий стек — в
    // `single-flight-outage.test.ts`; здесь пиннится ветвление самой функции.
    claimLock.mockResolvedValue({ status: "unavailable", error: new Error("timeout") });
    let computes = 0;

    const started = Date.now();
    const value = await withSingleFlight<string>({
      lockKey: LOCK,
      waitMs: 5000,
      read: async () => null,
      compute: async () => {
        computes += 1;
        return "computed";
      },
    });

    expect(value).toBe("computed");
    expect(computes).toBe(1);
    expect(Date.now() - started).toBeLessThan(500);
  });

  it("держатель снял замок без значения — проигравший считает сразу, а не ждёт до конца", async () => {
    // 29.09 доработки · 30: победитель упал (ИИ отказал) — замок снят в `finally`,
    // значения нет. Проигравший с долгим ожиданием не должен его отсиживать.
    // @probe 2026-10-01: без проверки снятого замка в цикле — красный, тест
    // отсидел все 5000 мс («держатель снял замок без значения…» 5004ms).
    store.set(LOCK, "1");
    setTimeout(() => store.delete(LOCK), 30);

    const started = Date.now();
    const value = await withSingleFlight<string>({
      lockKey: LOCK,
      waitMs: 5000,
      read: async () => null,
      compute: async () => "loser-computed",
    });

    expect(value).toBe("loser-computed");
    expect(Date.now() - started).toBeLessThan(1000);
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
