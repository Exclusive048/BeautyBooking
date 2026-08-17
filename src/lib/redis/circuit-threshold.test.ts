import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSilentRedis } from "@/lib/testing/silent-redis";

/**
 * FIX-D1 — размыкатель открывается после ПЕРВОЙ истёкшей команды.
 *
 * ## Почему порог поменялся
 *
 * Двойка выбиралась против стендовой оценки «обнаружение до 5 с». Живой замер
 * (SMOKE-02, реальная остановка Redis) дал другую величину: **7.63 с + 2.61 с ≈
 * 10.2 с** на два первых запроса, то есть решение принималось против числа,
 * которого нет. Порог 1 половинит видимый стопор.
 *
 * ⚠️ Значение ПРОВИЗОРНОЕ и помечено таким в коде и в `redis-down.md`: цена
 * ложного срабатывания (холодный кэш 5 с) пренебрежима на трафике закрытого
 * деплоя и меняется на боевом. Пересматривать только с новым замером.
 *
 * @probe   что сломать: вернуть `CONSECUTIVE_TIMEOUTS_TO_OPEN = 2`.
 *          наблюдалось: «после ПЕРВОЙ истёкшей команды размыкатель обязан быть
 *          открыт … получено false» → красный на первом тесте; второй
 *          (мгновенный отказ следующей команды) — тоже. Восстановлено, зелено.
 */

const silent = vi.hoisted(() => ({
  handle: null as ReturnType<typeof createSilentRedis> | null,
}));

vi.mock("@/lib/redis/connection", async () => {
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

const { getRedisCircuitState, resetRedisCircuit, withRedisCommandTimeout } = await import(
  "@/lib/redis/connection"
);

beforeEach(() => {
  silent.handle?.release();
  silent.handle = createSilentRedis();
  resetRedisCircuit();
});

describe("FIX-D1 · порог размыкателя = 1", () => {
  it(
    "🔴 одна истёкшая команда открывает размыкатель",
    async () => {
      expect(getRedisCircuitState().open).toBe(false);

      await withRedisCommandTimeout("probe", new Promise(() => {})).catch(() => undefined);

      expect(
        getRedisCircuitState().open,
        "после ПЕРВОЙ истёкшей команды размыкатель обязан быть открыт: живой " +
          "замер SMOKE-02 показал 7.63 + 2.61 с на обнаружение при пороге 2",
      ).toBe(true);
    },
    20_000,
  );

  it(
    "следующая команда отказывает МГНОВЕННО — это и есть выигрыш",
    async () => {
      await withRedisCommandTimeout("first", new Promise(() => {})).catch(() => undefined);

      const started = Date.now();
      const error = await withRedisCommandTimeout("second", new Promise(() => {})).catch(
        (e: unknown) => e,
      );
      const elapsed = Date.now() - started;

      expect(elapsed, `вторая команда стоила ${elapsed} мс вместо мгновенного отказа`).toBeLessThan(
        100,
      );
      // Форма отказа обязана остаться прежней — на ней держатся решения
      // fail-open/fail-closed (FIX-C4): вызывающий не отличает быстрый отказ от
      // медленного, поэтому политика не меняется от смены порога.
      expect((error as { code?: string }).code).toBe("REDIS_COMMAND_TIMEOUT");
    },
    20_000,
  );

  it("успешная команда счётчик сбрасывает — размыкатель не залипает", async () => {
    await withRedisCommandTimeout("ok", Promise.resolve("PONG"));
    expect(getRedisCircuitState().open).toBe(false);
    expect(getRedisCircuitState().consecutiveTimeouts).toBe(0);
  });

  it("наблюдатель (health-проба) размыкатель не двигает", async () => {
    // Зеркало урока FIX-C2: проба ИЗМЕРЯЕТ состояние и не должна ни читать
    // вердикт размыкателя, ни кормить его.
    await withRedisCommandTimeout("health", new Promise(() => {}), 50, {
      observeOnly: true,
    }).catch(() => undefined);
    expect(getRedisCircuitState().open).toBe(false);
  });
});
