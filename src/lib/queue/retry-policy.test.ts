import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_RETRY_DELAYS_MS,
  decideRetry,
  retryDelaysFor,
} from "@/lib/queue/retry-policy";
import type { Job } from "@/lib/queue/types";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

const sum = (values: readonly number[]) => values.reduce((acc, v) => acc + v, 0);

/** Все повторы задачи подряд: отказ за отказом, пока не умрёт. */
function runUntilDead(type: Job["type"]): { delays: number[]; deadAttempts: number } {
  const delays: number[] = [];
  let attempts = 0;
  for (let guard = 0; guard < 100; guard += 1) {
    const decision = decideRetry({ type, attempts });
    if (decision.kind === "dead") return { delays, deadAttempts: decision.attempts };
    delays.push(decision.delayMs);
    attempts = decision.attempts;
  }
  throw new Error(`${type}: повторы не кончаются`);
}

/**
 * QUEUE-RETRY-POLICY-PER-TYPE — расписание повторов по типу задачи.
 *
 * @probe Поставил `yookassa.webhook` на прежние 60/120/180 с (убрал строку из
 * таблицы) — краснеет «вебхук ЮКассы: суммарно 12–24 ч»: «expected 360000 to
 * be greater than or equal to 43200000». Поставил Telegram на `[2,4,8]` —
 * краснеет пин неизменного расписания.
 */
describe("QUEUE-RETRY-POLICY-PER-TYPE", () => {
  it("общий путь — как было: 60/120/180 с, затем мёртвые после четвёртого отказа", () => {
    for (const type of [
      "slot.freed",
      "media.cleanup",
      "mrr.snapshot.daily",
      "availableToday.recompute",
      "notification.billing.plan-edited.mass",
      "booking.reminder",
    ] as const) {
      const { delays, deadAttempts } = runUntilDead(type);
      expect(delays, type).toEqual([MINUTE, 2 * MINUTE, 3 * MINUTE]);
      expect(deadAttempts, type).toBe(4);
    }
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([MINUTE, 2 * MINUTE, 3 * MINUTE]);
  });

  it("Telegram, ВК и визуальный поиск — прежние 2/4/8/16 с при пяти попытках", () => {
    for (const type of ["telegram.send", "vk.send", "visual_search_index"] as const) {
      const { delays, deadAttempts } = runUntilDead(type);
      expect(delays, type).toEqual([2 * SECOND, 4 * SECOND, 8 * SECOND, 16 * SECOND]);
      // Прежнее условие `nextAttempts < maxAttempts (5)`: пятый отказ — мёртвые.
      expect(deadAttempts, type).toBe(5);
    }
  });

  it("push в приложение — 10/30/60/120/300 с", () => {
    expect(retryDelaysFor("push.native.send")).toEqual(
      [10, 30, 60, 120, 300].map((n) => n * SECOND),
    );
  });

  it("вебхук ЮКассы: суммарно 12–24 ч, паузы не убывают", () => {
    const delays = retryDelaysFor("yookassa.webhook");
    expect(sum(delays)).toBeGreaterThanOrEqual(12 * HOUR);
    expect(sum(delays)).toBeLessThanOrEqual(24 * HOUR);
    for (let i = 1; i < delays.length; i += 1) {
      expect(delays[i]).toBeGreaterThanOrEqual(delays[i - 1]);
    }
  });

  it("удаление медиа из хранилища: часы, а не минуты", () => {
    const delays = retryDelaysFor("media.purge");
    expect(sum(delays)).toBeGreaterThanOrEqual(12 * HOUR);
    expect(sum(delays)).toBeLessThanOrEqual(48 * HOUR);
    expect(Math.max(...delays)).toBeGreaterThanOrEqual(HOUR);
  });

  it("решение пишет в задачу число отказов с учётом текущего", () => {
    expect(decideRetry({ type: "slot.freed", attempts: 0 })).toEqual({
      kind: "retry",
      attempts: 1,
      delayMs: MINUTE,
    });
    expect(decideRetry({ type: "slot.freed", attempts: 3 })).toEqual({ kind: "dead", attempts: 4 });
    // Задача из прежней версии без поля `attempts` — как с нулём.
    expect(decideRetry({ type: "slot.freed" } as Pick<Job, "type" | "attempts">)).toMatchObject({
      kind: "retry",
      attempts: 1,
    });
  });

  /**
   * worker.ts не импортируется в тесте (запускает воркер на импорте), поэтому
   * отсутствие второй арифметики повторов проверяется по исходнику: каждый
   * `enqueueRetry(` либо откладывает до `scheduleAt`, либо берёт паузу из
   * решения политики.
   *
   * @probe Заменил паузу на `60_000 * decision.attempts` в трёх вызовах (общий
   * `catch`, напоминание, `retryOrDeadLetter`) — краснеет: «expected
   * [ '60_000 * decision.attempts', …(2) ] to deeply equal []».
   */
  it("воркер не считает паузы повторов сам", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8");
    const calls = [...worker.matchAll(/await enqueueRetry\(([\s\S]*?)\);/g)].map((m) => m[1]);
    expect(calls.length).toBeGreaterThan(0);
    const foreign = calls
      .map((args) => args.slice(args.lastIndexOf(",") + 1).trim())
      .filter((delay) => delay !== "scheduleAt - Date.now()" && delay !== "decision.delayMs");
    expect(foreign).toEqual([]);
  });
});
