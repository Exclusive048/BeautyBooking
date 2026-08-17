import { describe, expect, it, vi, beforeEach } from "vitest";

import { createSilentRedis } from "@/lib/testing/silent-redis";

/**
 * FIX-C11 — воронка записи обязана РАБОТАТЬ при молчащем Redis, а не отдавать 500.
 *
 * ## Что было измерено
 *
 * `withSingleFlight` звал `cache.setNx` без `try/catch`, а `setNx` при истёкшей
 * команде НЕ возвращает `false` — он логирует и **бросает дальше**
 * (`redisClient.ts:141-144`). Отказ уходил мимо обоих правил, которые функция
 * объявляет в собственной шапке, причём правило 2 было прямо ЛОЖНЫМ про
 * зависимость: «`setNx` возвращает `false` … когда команда не прошла».
 *
 * При остановленном Redis `/slots`, `/booking-days` и `/availability` отвечали
 * **500**. Каталог при этом отвечал 200 — именно поэтому обрыв читался как
 * переживаемый и таковым не был: **гость не доходил до кнопки отправки**.
 *
 * ## Почему тест выглядит именно так
 *
 * Стек НЕ подменяется: `withSingleFlight` → настоящий `cache.ts` → настоящий
 * `redisClient` → настоящий `withRedisCommandTimeout` (с размыкателем FIX-C4) →
 * стенд `silent-redis`. Мок фасада кэша здесь запрещён по построению — ровно он
 * и спрятал дефект: `single-flight.test.ts:109` моделировал недоступность как
 * `setNx.mockResolvedValue(false)`, то есть проверял поведение, которого у
 * зависимости нет (см. пару-противоречие в отчёте FIX-C11).
 *
 * Таймеры не подменяются: дедлайн — предмет проверки.
 *
 * @probe   ДВЕ пробы, и вторая изменила сам тест (правило 9 GUARD-INTEGRITY).
 *
 *          A (минимальная — граница перестала переводить): в `lib/cache/cache.ts`
 *          снять `try/catch` из `claimLock`.
 *          наблюдалось: «Redis command timeout: operation=cache:setNx,
 *          timeoutMs=2500» — красный на всех трёх тестах файла + на четырёх в
 *          `lock-degradation.test.ts`. То есть ровно те 500, ради которых фикс.
 *
 *          B (ПРАВДОПОДОБНАЯ — вызывающий спутал «недоступно» с «занято»):
 *          в `single-flight.ts` снять строку
 *          `if (claim.status === "unavailable") return input.compute();`.
 *          🔴 наблюдалось: **два теста из трёх остались ЗЕЛЁНЫМИ**, и весь
 *          `single-flight.test.ts` тоже. Причина: управление уходит в ветку
 *          «занято», `cache.get` при молчащем Redis отвечает промахом, и
 *          `compute()` всё равно вызывается — значение возвращается.
 *          Красным был только третий тест, и то по порогу времени.
 *
 *          Вывод и правка: утверждение «воронка отвечает значением» НЕ
 *          различает исправленный код и эту регрессию — различает только ЧИСЛО
 *          команд, ушедших к молчащей зависимости (одна против двух). Третий
 *          тест переписан с порога времени на счётчик стенда; после правки
 *          проба B даёт «expected [ 'set', 'get' ] to deeply equal [ 'set' ]».
 *
 *          Обе пробы восстановлены, `diff` с бэкапом пуст, зелено.
 */

const silent = vi.hoisted(() => ({
  handle: null as ReturnType<typeof createSilentRedis> | null,
}));

// Без REDIS_URL фасад выбрал бы `memoryClient`, который не отказывает никогда,
// и тест стал бы вакуумным: он зеленел бы и на сломанном коде.
vi.mock("@/lib/env", () => ({
  env: { REDIS_URL: "redis://silent:6379", NODE_ENV: "test" },
  isProduction: false,
}));
vi.mock("@/lib/redis/connection", async () => {
  // Граница и размыкатель — предмет проверки, не мокаются.
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

const { resetRedisCircuit } = await import("@/lib/redis/connection");
const { withSingleFlight } = await import("@/lib/cache/single-flight");

beforeEach(() => {
  silent.handle?.release();
  silent.handle = createSilentRedis();
  resetRedisCircuit();
});

describe("FIX-C11 · single-flight при молчащем Redis отдаёт значение, а не 500", () => {
  it(
    "🔴 воронка отвечает посчитанным значением (репродукция дефекта: было 500)",
    async () => {
      // Ровно то, что делают `/slots`, `/booking-days` и `/availability`: замок,
      // затем расчёт. До фикса `setNx` бросал и отказ уходил в обработчик роута.
      const value = await withSingleFlight<string>({
        lockKey: "sf:slots:outage",
        read: async () => null,
        compute: async () => "computed",
      });

      expect(
        value,
        "замок недоступен — работа обязана быть сделана, а не отменена: " +
          "именно здесь гость терял кнопку отправки",
      ).toBe("computed");
    },
    20_000,
  );

  it(
    "работа делается РОВНО один раз — замок не подменяется вторым расчётом",
    async () => {
      let computes = 0;

      const value = await withSingleFlight<string>({
        lockKey: "sf:slots:outage:single",
        read: async () => null,
        compute: async () => {
          computes += 1;
          return "computed";
        },
      });

      expect(value).toBe("computed");
      // Пропуск замка не должен превращаться ни в отказ, ни в повторный счёт:
      // цена деградации — отсутствие дедупликации между ПАРАЛЛЕЛЬНЫМИ запросами,
      // а не удвоение работы внутри одного.
      expect(computes, `расчётов ${computes}, ожидался один`).toBe(1);
    },
    20_000,
  );

  it(
    "🔴 «недоступно» распознано, а НЕ провалилось в ветку «занято»",
    async () => {
      // ⚠️ Этот тест — единственный, который различает правильную обработку и
      // правдоподобную регрессию, и найдено это ПРОБОЙ, а не рассуждением.
      //
      // Если снять ветку `unavailable`, управление уходит в ветку «занято»:
      // та зовёт `cache.get(lockKey)`, при молчащем Redis получает промах и
      // ТОЖЕ доходит до `compute()`. То есть оба теста выше остаются ЗЕЛЁНЫМИ
      // на сломанном коде — значение возвращается в обоих случаях.
      //
      // Наблюдаемое различие — ЧИСЛО КОМАНД, ушедших к молчащей зависимости:
      // одна (`setNx`) против двух (`setNx` + `get`). Это и есть цена ошибки —
      // лишний дедлайн на КАЖДЫЙ запрос слотов во время обрыва, — поэтому
      // проверяется счётчик стенда, а не порог по времени.
      const value = await withSingleFlight<string>({
        lockKey: "sf:slots:outage:nowait",
        waitMs: 5_000,
        read: async () => null,
        compute: async () => "computed",
      });

      expect(value).toBe("computed");
      expect(
        silent.handle!.commands(),
        "после отказа замка ни одна следующая команда к молчащей зависимости не " +
          "оправдана: держателя не существует, спрашивать про него нечего",
      ).toEqual(["set"]);
    },
    20_000,
  );
});
