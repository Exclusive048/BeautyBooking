import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * RES-25 — пинг живости воркера не имеет права держать разбор очереди.
 *
 * `pingHealthcheck` вызывается из главного цикла (`await maybePingHealthcheck()`)
 * **до** `dequeue()`, то есть это не фоновая телеметрия, а часть витка. Без
 * границы зависший `app` останавливал обработку задач полностью — при том что
 * собственные зависимости воркера (Redis, Postgres) в порядке. Симптом при этом
 * ровно обратный ожидаемому: канал, по которому мы узнаём «воркер жив», сам
 * воркер и глушил.
 *
 * Проверка source-level: `src/worker.ts` — точка входа, он запускает цикл прямо
 * на импорте, поэтому в vitest его не поднять. Тот же приём, что у RES-16
 * (`stop-grace-period.test.ts`), и по той же причине: цена регрессии здесь
 * невидима на глаз — «всё работает», просто очередь стоит.
 */

const WORKER_SOURCE = readFileSync(resolve(process.cwd(), "src", "worker.ts"), "utf8");

function readConstantMs(name: string): number {
  const match = WORKER_SOURCE.match(new RegExp(`const ${name} = ([\\d_]+);`));
  expect(match, `константа ${name} не найдена`).toBeTruthy();
  return Number(match![1].replace(/_/g, ""));
}

describe("pingHealthcheck — верхняя граница (RES-25)", () => {
  it("запрос к /api/health/worker уходит с AbortSignal.timeout", () => {
    const call = WORKER_SOURCE.match(/await fetch\(healthcheckUrl, \{[\s\S]*?\n {4}\}\);/);
    expect(call, "вызов fetch(healthcheckUrl, …) не найден").toBeTruthy();
    expect(call![0]).toContain("AbortSignal.timeout(HEALTHCHECK_REQUEST_TIMEOUT_MS)");
  });

  it("граница меньше интервала между пингами — иначе витки наложатся", () => {
    const timeout = readConstantMs("HEALTHCHECK_REQUEST_TIMEOUT_MS");
    const interval = readConstantMs("HEALTHCHECK_INTERVAL_MS");

    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThan(interval);
  });

  it("отказ пинга остаётся проглоченным и не поднимает алерт", () => {
    // ping — телеметрия: его провал не должен ни ронять воркер, ни звенеть в
    // Telegram (иначе недоступный `app` даст шторм алертов от обеих сторон)
    const handler = WORKER_SOURCE.match(/logError\("Worker healthcheck ping failed",[\s\S]*?\}\);/);
    expect(handler, "catch вокруг пинга не найден").toBeTruthy();
    expect(handler![0]).toContain("__skipAlert: true");
  });
});
