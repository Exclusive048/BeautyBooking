import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createHangingFetch } from "@/lib/testing/hanging-fetch";
import {
  createHealthcheckPinger,
  HEALTHCHECK_INTERVAL_MS,
  HEALTHCHECK_REQUEST_TIMEOUT_MS,
} from "@/lib/queue/healthcheck-ping";

/**
 * RES-25 — пинг живости воркера не имеет права держать разбор очереди.
 *
 * `maybePingHealthcheck()` вызывается из главного цикла **до** `dequeue()`, то
 * есть это не фоновая телеметрия, а часть витка. Без границы зависший `app`
 * останавливал обработку задач полностью — при том что собственные зависимости
 * воркера (Redis, Postgres) в порядке. Симптом ровно обратный ожидаемому: канал,
 * по которому мы узнаём «воркер жив», сам воркер и глушил. И это худший класс по
 * наблюдаемости — очередь стоит, ошибок нет, healthcheck зелёный, алертов нет.
 *
 * GUARD-INTEGRITY (FIX-B10 → FIX-B13). Этот сторож был последним из шести
 * ШАПОЧНЫМ: он читал текст `src/worker.ts` регекспом и потому не доказывал ни
 * того, что константа доходит до `fetch` в рантайме, ни того, что дедлайн
 * СРАБАТЫВАЕТ, ни того, что `catch` отрабатывает и цикл продолжается. Причина
 * была настоящей — `pingHealthcheck` жил приватно в точке входа, которая на
 * импорте поднимает Redis, Postgres и таймеры. FIX-B13 вынес механику в
 * `lib/queue/healthcheck-ping.ts` с инжектируемым `fetchImpl` (приём
 * `createSmscProvider`), и проверка стала поведенческой.
 *
 * ⚠️ Ловушка вакуумности, из-за которой секрет здесь ИНЖЕКТИРУЕТСЯ: без
 * `WORKER_SECRET` пинг штатно выходит ДО `fetch`. Прогон в окружении без
 * переменной был бы зелёным, ничего не проверив, — поэтому секрет задаётся явно,
 * а факт обращения подтверждается `callCount()`.
 *
 * Таймеры намеренно НЕ подменяются: `AbortSignal.timeout` живёт в нативном слое
 * Node, мимо `globalThis.setTimeout`, и фейковый таймер дал бы зелёный тест при
 * мёртвом дедлайне — ровно та дыра, которую стенд закрывает.
 *
 * @probe   что сломать: в `healthcheck-ping.ts` заменить
 *          `signal: AbortSignal.timeout(timeoutMs)` на
 *          `signal: new AbortController().signal`.
 *          наблюдалось: «зависший app не останавливает виток» красный по
 *          таймауту теста (11000 ms) с «test timed out» — то есть `maybePing`
 *          не вернулся и цикл до `dequeue()` не дошёл; ПРЕЖНЯЯ (шапочная) форма
 *          на этой же мутации осталась бы зелёной. После отката — зелёный,
 *          файл побайтово прежний.
 */

const SLACK_MS = 4_000;

const WORKER_SOURCE = readFileSync(resolve(process.cwd(), "src", "worker.ts"), "utf8");

function pingerAgainst(fetchImpl: typeof fetch) {
  return createHealthcheckPinger({
    fetchImpl,
    resolveSecret: () => "worker-secret",
    resolveUrl: () => "http://app.test/api/health/worker",
  });
}

describe("RES-25 · дедлайн пинга срабатывает, а не просто объявлен", () => {
  it(
    "зависший app не останавливает виток: maybePing возвращается, цикл доходит до dequeue",
    async () => {
      const harness = createHangingFetch();
      const pinger = pingerAgainst(harness.fetch);

      // Модель витка главного цикла: `await maybePingHealthcheck()`, затем
      // `dequeue()`. Флаг ставится ПОСЛЕ ожидания, поэтому он и есть ответ на
      // «дошёл ли цикл до разбора очереди».
      let reachedDequeue = false;
      const startedAt = Date.now();
      await pinger.maybePing();
      reachedDequeue = true;
      const elapsed = Date.now() - startedAt;

      harness.release();

      expect(harness.callCount(), "пинг не дошёл до fetch — секрет не задан, тест вакуумен").toBe(1);
      expect(reachedDequeue, "виток не продолжился — очередь встала").toBe(true);
      expect(
        elapsed,
        `пинг держал виток ${elapsed} мс при границе ${HEALTHCHECK_REQUEST_TIMEOUT_MS} мс`,
      ).toBeLessThan(HEALTHCHECK_REQUEST_TIMEOUT_MS + SLACK_MS);
      // Нижняя граница: мгновенный возврат означал бы, что мы поймали не
      // дедлайн, а ранний выход (нет секрета, синхронный throw) — и тест прошёл
      // бы мимо предмета проверки.
      expect(
        elapsed,
        `пинг вернулся через ${elapsed} мс — это не срабатывание дедлайна`,
      ).toBeGreaterThan(HEALTHCHECK_REQUEST_TIMEOUT_MS / 2);
    },
    HEALTHCHECK_REQUEST_TIMEOUT_MS + SLACK_MS + 2_000,
  );

  it("отказ пинга проглочен: maybePing не бросает даже при мгновенной ошибке", async () => {
    // Вторая половина «цикл продолжается»: не только таймаут, но и любой отказ
    // транспорта обязан остаться внутри. Проброс наружу уронил бы виток.
    const rejecting = (async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    await expect(pingerAgainst(rejecting).maybePing()).resolves.toBeUndefined();
  });

  it("без WORKER_SECRET обращения не происходит — и это не считается пингом", () => {
    const harness = createHangingFetch();
    const pinger = createHealthcheckPinger({
      fetchImpl: harness.fetch,
      resolveSecret: () => null,
      resolveUrl: () => "http://app.test/api/health/worker",
    });

    // Синхронно по построению: ветка выходит до любого await по сети.
    void pinger.maybePing();
    expect(harness.callCount()).toBe(0);
    harness.release();
  });

  it("граница меньше интервала между пингами — иначе витки наложатся", () => {
    expect(HEALTHCHECK_REQUEST_TIMEOUT_MS).toBeGreaterThan(0);
    expect(HEALTHCHECK_REQUEST_TIMEOUT_MS).toBeLessThan(HEALTHCHECK_INTERVAL_MS);
  });

  it("lockstep: пинг по-прежнему стоит в цикле ПЕРЕД dequeue", () => {
    // Единственная половина, которую нельзя проверить поведенчески без подъёма
    // точки входа: порядок вызовов в главном цикле. Если пинг уедет ПОСЛЕ
    // `dequeue()` или исчезнет, поведенческий тест выше останется зелёным —
    // он про механику пинга, а не про его место.
    const loop = WORKER_SOURCE.slice(WORKER_SOURCE.indexOf("while (!isShuttingDown)"));
    const pingAt = loop.indexOf("maybePingHealthcheck()");
    const dequeueAt = loop.indexOf("await dequeue()");

    expect(pingAt, "вызов пинга исчез из главного цикла").toBeGreaterThan(-1);
    expect(dequeueAt, "вызов dequeue исчез из главного цикла").toBeGreaterThan(-1);
    expect(pingAt, "пинг больше не предшествует dequeue").toBeLessThan(dequeueAt);
  });
});
