import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSilentRedis } from "@/lib/testing/silent-redis";

/**
 * FIX-C4 — поведение при молчащем Redis: каждый сайт отвечает в пределах
 * дедлайна и принимает СВОЁ решение, а страница не платит сумму дедлайнов.
 *
 * ## Что моделируется и почему не «отказ»
 *
 * Стенд `lib/testing/silent-redis.ts` возвращает промисы, которые не резолвятся
 * и не отклоняются — это боевой механизм (`redis@5` во время реконнекта кладёт
 * команду в offline-очередь). Мок «Redis бросает» зеленел бы на сломанном коде:
 * отказ приходит мгновенно и его переживает любой вызывающий.
 *
 * Таймеры НЕ подменяются: дедлайн — предмет проверки, поддельный таймер показал
 * бы зелёное и при мёртвом дедлайне.
 *
 * ## Замер, который и определил фикс
 *
 * До размыкателя четыре последовательных `cache.get` стоили **10.04 с**
 * (4 × 2.5 с, аддитивно) — отсюда 9.2 / 14.0 / 20.9 с на витрине
 * (`SMOKE-01 · F5`). Покомандная граница RES-01 верна для команды и не
 * ограничивает страницу; поэтому добавлен размыкатель.
 *
 * @probe   что сломать: в `lib/redis/connection.ts` вернуть
 *          `withRedisCommandTimeout` к прежней форме (снять размыкатель —
 *          убрать ранний `return Promise.reject` и `onCommandSettled`).
 *          наблюдалось: «страница платит сумму дедлайнов: 10036 мс» — красный
 *          на «последовательные чтения не складываются в сумму дедлайнов».
 *          Второй пробой снят `withRedisCommandTimeout` из `cache:get` →
 *          «Test timed out in 20000ms», то есть боевое зависание.
 *          Оба восстановлены, `diff` с бэкапом пуст, зелено.
 */

const silent = vi.hoisted(() => ({
  handle: null as ReturnType<typeof createSilentRedis> | null,
}));

vi.mock("@/lib/redis/connection", async () => {
  // Граница и размыкатель НЕ мокаются — они и есть предмет проверки.
  const actual = await vi.importActual<typeof import("@/lib/redis/connection")>(
    "@/lib/redis/connection",
  );
  return {
    ...actual,
    getRedisConnection: async () => silent.handle!.client,
    getRedisSubscriberConnection: async () => silent.handle!.client,
  };
});
vi.mock("@/lib/logging/logger", () => ({ logError: () => {}, logInfo: () => {} }));

const { resetRedisCircuit, getRedisCircuitState, withRedisCommandTimeout } = await import(
  "@/lib/redis/connection"
);
const { redisClient } = await import("@/lib/cache/redisClient");

/** Одна команда стоит столько; всё остальное — про то, сколько их. */
const COMMAND_BUDGET_MS = 2_500;

beforeEach(() => {
  silent.handle?.release();
  silent.handle = createSilentRedis();
  resetRedisCircuit();
});

describe("FIX-C4 · чтение кэша деградирует в промах, а не в ожидание", () => {
  it("одиночное чтение отвечает промахом внутри бюджета команды", async () => {
    const started = Date.now();
    const value = await redisClient.get("k");
    const elapsed = Date.now() - started;

    expect(value, "чтение при молчащем Redis обязано быть cache-miss").toBeNull();
    expect(
      elapsed,
      "команда не уложилась в собственный дедлайн — это боевое зависание",
    ).toBeLessThan(COMMAND_BUDGET_MS + 1_500);
  });

  it(
    "🔴 последовательные чтения НЕ складываются в сумму дедлайнов",
    async () => {
      // Свойство, ради которого и заведён размыкатель: цена страницы не растёт
      // линейно с числом обращений к молчащей зависимости. Замер до фикса —
      // 10.04 с на ЧЕТЫРЕ чтения; здесь их восемь.
      const started = Date.now();
      for (let i = 0; i < 8; i++) await redisClient.get(`k${i}`);
      const elapsed = Date.now() - started;

      expect(
        elapsed,
        `страница платит сумму дедлайнов: ${elapsed} мс. Именно так витрина ` +
          "получала 9.2 / 14.0 / 20.9 с при живом коде и верной покомандной " +
          "границе (SMOKE-01 · F5)",
      ).toBeLessThan(2 * COMMAND_BUDGET_MS + 1_500);
      expect(getRedisCircuitState().open, "размыкатель обязан быть открыт").toBe(true);
    },
    20_000,
  );

  it(
    "восстановление идёт пробой после окна, а не мгновенно",
    async () => {
      // Семантика намеренно такая: пока окно открыто, НИЧЕГО не пропускается —
      // иначе «успешная» команда в открытом состоянии снова стоила бы полного
      // дедлайна, и размыкатель не защищал бы. Поднявшийся Redis подхватывается
      // первой же пробой после истечения окна; для кэша лишние секунды
      // холодного режима не стоят ничего.
      await redisClient.get("a");
      await redisClient.get("b");
      expect(getRedisCircuitState().open, "после двух молчаний обязан открыться").toBe(true);

      // В открытом окне успех не проходит — и это проверяемо.
      await withRedisCommandTimeout("early", Promise.resolve("PONG")).catch(() => undefined);
      expect(getRedisCircuitState().open).toBe(true);

      await new Promise((r) => setTimeout(r, 5_100));

      // Окно истекло — эта команда идёт пробой и закрывает размыкатель.
      await withRedisCommandTimeout("probe", Promise.resolve("PONG"));
      expect(getRedisCircuitState().open).toBe(false);
      expect(getRedisCircuitState().consecutiveTimeouts).toBe(0);
    },
    20_000,
  );

  it(
    "проба стоит много меньше обычной команды",
    async () => {
      // Проба лежит на запросе ПОЛЬЗОВАТЕЛЯ, поэтому её бюджет укорочен: иначе
      // витрина получала бы многосекундные всплески, только реже.
      await redisClient.get("a");
      await redisClient.get("b");
      await new Promise((r) => setTimeout(r, 5_100));

      const started = Date.now();
      await redisClient.get("probe-key");
      const probeMs = Date.now() - started;

      expect(
        probeMs,
        `проба стоила ${probeMs} мс — столько же, сколько обычная команда, ` +
          "то есть всплески вернулись",
      ).toBeLessThan(1_000);
    },
    20_000,
  );
});

describe("FIX-C4 · решение сайта сохраняется, меняется только ожидание", () => {
  it("замок отказывает (throw), а не притворяется взятым", async () => {
    // Различать «замок взят» и «замок не взят» обязательно — иначе
    // идемпотентность брони и прогон продлений теряют смысл. Форма отказа
    // после размыкателя обязана остаться той же.
    await expect(redisClient.setNx("lock", "v", 30)).rejects.toBeTruthy();
  });

  it(
    "быстрый отказ размыкателя неотличим от истёкшего дедлайна",
    async () => {
      // 🔴 Ключевое свойство для политики: вызывающий не может отличить одно от
      // другого, поэтому решения fail-open/fail-closed (FIX-B12, SEC-04)
      // сохраняются буквально — их код о размыкателе даже не знает.
      const first = await withRedisCommandTimeout("x", new Promise(() => {})).catch(
        (e: unknown) => e,
      );
      const second = await withRedisCommandTimeout("x", new Promise(() => {})).catch(
        (e: unknown) => e,
      );
      const startedThird = Date.now();
      const third = await withRedisCommandTimeout("x", new Promise(() => {})).catch(
        (e: unknown) => e,
      );
      const thirdMs = Date.now() - startedThird;

      for (const error of [first, second, third]) {
        expect((error as { code?: string }).code).toBe("REDIS_COMMAND_TIMEOUT");
        expect(error).toBeInstanceOf(Error);
      }
      expect(thirdMs, "третья команда обязана отказать мгновенно").toBeLessThan(100);
    },
    20_000,
  );

  it("запись в кэш не бросает — она best-effort", async () => {
    await expect(redisClient.set("k", { a: 1 }, 60)).resolves.toBeUndefined();
  });

  it("инвалидация не бросает — иначе отказ кэша ронял бы мутацию", async () => {
    await expect(redisClient.del("k")).resolves.toBeUndefined();
  });
});
