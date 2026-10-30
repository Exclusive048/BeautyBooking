import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createNoOverlapRunner } from "@/lib/queue/no-overlap";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/**
 * @probe Убрал `if (running) return { ran: false }` — краснеет «тик во время
 * прохода пропускается»: «expected 2 to be 1». Перенёс `running = false` из
 * `finally` в конец `try` — краснеет «после отказа следующий тик идёт»:
 * «expected { ran: false } to match object { ran: true, value: 'ok' }».
 */
describe("createNoOverlapRunner", () => {
  it("тик во время прохода пропускается, после прохода — снова идёт", async () => {
    const gate = deferred();
    let starts = 0;
    const run = createNoOverlapRunner(async () => {
      starts += 1;
      await gate.promise;
      return starts;
    });

    const first = run();
    const second = run();
    expect(starts).toBe(1);

    gate.resolve();
    expect(await second).toEqual({ ran: false });
    expect(await first).toEqual({ ran: true, value: 1 });
    expect(await run()).toEqual({ ran: true, value: 2 });
  });

  it("после отказа следующий тик идёт", async () => {
    let fail = true;
    const run = createNoOverlapRunner(async () => {
      if (fail) throw new Error("db down");
      return "ok";
    });

    await expect(run()).rejects.toThrow("db down");
    fail = false;
    expect(await run()).toMatchObject({ ran: true, value: "ok" });
  });

  /**
   * worker.ts не импортируется в тесте (запускает воркер на импорте). Свипы
   * обязаны идти только через раннер: прямой вызов рядом с ним (стартовый
   * прогон, второй интервал) снова пускал бы проходы внахлёст.
   *
   * @probe Вернул в стартовый прогон «свободно сегодня» прямой
   * `void recomputeAvailableToday()` рядом с раннером — краснеет: «expected
   * [ 'recomputeAvailableToday()', …(1) ] to have a length of 1 but got 2».
   */
  it("воркер вызывает свипы только через раннер (AVAILABLE-TODAY-SWEEP-WRITE, YOOKASSA-PENDING-SWEEP)", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8");
    for (const sweep of ["recomputeAvailableToday", "sweepPendingYookassaPayments"]) {
      const calls = worker.match(new RegExp(`\\b${sweep}\\(\\)`, "g")) ?? [];
      expect(calls).toHaveLength(1);
      expect(worker).toContain(`createNoOverlapRunner(() => ${sweep}())`);
    }
  });
});
