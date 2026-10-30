import { describe, expect, it } from "vitest";

import { createRenderLimiter } from "@/lib/media/render-limit";

/**
 * MEDIA-RENDER-DEDUP — предел одновременных рендеров: не больше `limit`
 * задач сразу, ожидающие стартуют по очереди, слот освобождается и при
 * ошибке задачи.
 *
 * @probe 2026-10-30 — в `release` слот возвращается счётчиком, а не передаётся
 *        ожидающему (`active -= 1; next?.()`): красный «освободившийся слот
 *        передаётся ждущему» — новый запрос стартует рядом с разбуженным
 *        (`["a", "c", "d"]` при пределе 1). Возвращено — зелёный.
 * @probe 2026-10-30 — `release()` перенесён из `finally` в ветку успеха:
 *        красный «упавшая задача освобождает слот» (следующая задача не
 *        стартует вовсе — тест падает по таймауту).
 *        Возвращено — зелёный.
 */

type Gate = { open: () => void; promise: Promise<void> };

function gate(): Gate {
  let open!: () => void;
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { open, promise };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createRenderLimiter", () => {
  it("одновременно выполняется не больше `limit` задач", async () => {
    const limiter = createRenderLimiter(2);
    const gates = Array.from({ length: 5 }, gate);
    let running = 0;
    let peak = 0;
    const runs = gates.map((g) =>
      limiter.run(async () => {
        running += 1;
        peak = Math.max(peak, running);
        await g.promise;
        running -= 1;
      }),
    );

    await tick();
    expect(limiter.stats()).toEqual({ active: 2, waiting: 3 });

    for (const g of gates) {
      g.open();
      await tick();
    }
    await Promise.all(runs);
    expect(peak).toBe(2);
    expect(limiter.stats()).toEqual({ active: 0, waiting: 0 });
  });

  it("ждущие стартуют в порядке очереди", async () => {
    const limiter = createRenderLimiter(1);
    const first = gate();
    const started: string[] = [];
    const a = limiter.run(async () => {
      started.push("a");
      await first.promise;
    });
    const b = limiter.run(async () => {
      started.push("b");
    });
    const c = limiter.run(async () => {
      started.push("c");
    });
    await tick();
    expect(started).toEqual(["a"]);
    first.open();
    await Promise.all([a, b, c]);
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("освободившийся слот передаётся ждущему: новый запрос его не перехватывает", async () => {
    const limiter = createRenderLimiter(1);
    const first = gate();
    const second = gate();
    const started: string[] = [];
    const a = limiter.run(async () => {
      started.push("a");
      await first.promise;
    });
    const c = limiter.run(async () => {
      started.push("c");
      await second.promise;
    });
    await tick();
    first.open();
    await tick();
    expect(started).toEqual(["a", "c"]);

    // «c» держит переданный слот — новый запрос ждёт, а не стартует рядом.
    const d = limiter.run(async () => {
      started.push("d");
    });
    await tick();
    expect(started).toEqual(["a", "c"]);
    expect(limiter.stats()).toEqual({ active: 1, waiting: 1 });

    second.open();
    await Promise.all([a, c, d]);
    expect(started).toEqual(["a", "c", "d"]);
  });

  it("упавшая задача освобождает слот и отдаёт ошибку вызывающему", async () => {
    const limiter = createRenderLimiter(1);
    await expect(limiter.run(async () => Promise.reject(new Error("sharp")))).rejects.toThrow("sharp");
    await expect(limiter.run(async () => "ok")).resolves.toBe("ok");
    expect(limiter.stats()).toEqual({ active: 0, waiting: 0 });
  });

  it.each([0, -1, 1.5, Number.NaN])("предел %s — ошибка конфигурации", (limit) => {
    expect(() => createRenderLimiter(limit)).toThrow(/positive integer/);
  });
});
