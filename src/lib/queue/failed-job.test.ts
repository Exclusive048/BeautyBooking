import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const logError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/logging/logger", () => ({ logError, logInfo: vi.fn() }));

import { QueueBookkeepingError, recordJobFate, settleFailedJob } from "@/lib/queue/failed-job";
import { retryDelaysFor } from "@/lib/queue/retry-policy";
import { MEDIA_CLEANUP_JOB_TYPE, type Job } from "@/lib/queue/types";

function job(attempts = 0): Job {
  return {
    id: "job-1",
    type: MEDIA_CLEANUP_JOB_TYPE,
    payload: {},
    attempts,
    createdAt: 0,
  } as Job;
}

function redisTimeout(): Error {
  return Object.assign(new Error("Redis command timed out"), { code: "REDIS_COMMAND_TIMEOUT" });
}

function deps() {
  return {
    retry: vi.fn<(job: Job, delayMs: number) => Promise<void>>().mockResolvedValue(undefined),
    deadLetter: vi.fn<(job: Job, error: unknown) => Promise<void>>().mockResolvedValue(undefined),
  };
}

function loggedMessages(): string[] {
  return logError.mock.calls.map((call) => call[0] as string);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/**
 * WORKER-CATCH-REDIS-SAFE (A-08).
 *
 * @probe Убрал `try/catch` вокруг `deps.retry`/`deps.deadLetter` — краснеют
 * «повтор не записан…» и «мёртвые не записаны…»: «QueueBookkeepingError: Queue
 * retry write failed: Redis command timed out» / «Error: Redis command timed
 * out» (исключение вылетает из `settleFailedJob`, как прежде из `processJob`).
 * Убрал ранний выход для `QueueBookkeepingError` — краснеет «обработчик сам
 * упал на записи повтора…»: «expected true to be false». Убрал в воркере
 * `if (!settled) return;` — краснеет «воркер подтверждает задачу, только
 * если…»: «expected 'async function processJob(job: Job): …' to match
 * /const settled = await settleFailedJob…/». Вернул в `moveToDeadQueue`
 * алерт до голого `enqueueDeadJob` — краснеет тот же тест: «expected 'async
 * function moveToDeadQueue(job: J…' to match /await recordJobFate\("dead-letter"…/».
 */
describe("WORKER-CATCH-REDIS-SAFE — судьба упавшей задачи", () => {
  it("упавший обработчик: повтор по таблице типа, задачу можно подтверждать", async () => {
    const d = deps();
    const failure = new Error("db down");

    const settled = await settleFailedJob(job(0), failure, d);

    expect(settled).toBe(true);
    expect(d.retry).toHaveBeenCalledTimes(1);
    expect(d.retry.mock.calls[0][0]).toMatchObject({ id: "job-1", attempts: 1 });
    expect(d.retry.mock.calls[0][1]).toBe(retryDelaysFor(MEDIA_CLEANUP_JOB_TYPE)[0]);
    expect(d.deadLetter).not.toHaveBeenCalled();
    // Отказ обработчика по-прежнему алертит — как было до правки.
    expect(logError).toHaveBeenCalledWith(
      "Worker job processing failed",
      expect.not.objectContaining({ __skipAlert: true }),
    );
  });

  it("повторы кончились: в мёртвые с исходной ошибкой", async () => {
    const d = deps();
    const failure = new Error("db down");
    const exhausted = retryDelaysFor(MEDIA_CLEANUP_JOB_TYPE).length;

    const settled = await settleFailedJob(job(exhausted), failure, d);

    expect(settled).toBe(true);
    expect(d.retry).not.toHaveBeenCalled();
    expect(d.deadLetter).toHaveBeenCalledWith(
      expect.objectContaining({ attempts: exhausted + 1 }),
      failure,
    );
  });

  it("повтор не записан (Redis молчит): не бросает, задачу НЕ подтверждать, лог без алерта", async () => {
    const d = deps();
    d.retry.mockRejectedValue(new QueueBookkeepingError("retry", redisTimeout()));

    const settled = await settleFailedJob(job(0), new Error("db down"), d);

    expect(settled).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      "Worker job left in processing: queue write failed",
      expect.objectContaining({
        jobId: "job-1",
        operation: "retry",
        error: "Redis command timed out",
        __skipAlert: true,
      }),
    );
  });

  it("мёртвые не записаны: не бросает, задачу НЕ подтверждать", async () => {
    const d = deps();
    d.deadLetter.mockRejectedValue(redisTimeout());
    const exhausted = retryDelaysFor(MEDIA_CLEANUP_JOB_TYPE).length;

    const settled = await settleFailedJob(job(exhausted), new Error("db down"), d);

    expect(settled).toBe(false);
    expect(logError).toHaveBeenCalledWith(
      "Worker job left in processing: queue write failed",
      expect.objectContaining({ operation: "dead-letter", __skipAlert: true }),
    );
  });

  it("обработчик сам упал на записи повтора: второй записи в тот же Redis нет", async () => {
    const d = deps();

    const settled = await settleFailedJob(
      job(0),
      new QueueBookkeepingError("retry", redisTimeout()),
      d,
    );

    expect(settled).toBe(false);
    expect(d.retry).not.toHaveBeenCalled();
    expect(d.deadLetter).not.toHaveBeenCalled();
    // Отказ записи — не отказ обработчика: алертящего лога нет, только тихий.
    expect(loggedMessages()).toEqual(["Worker job left in processing: queue write failed"]);
  });

  it("recordJobFate: любая ошибка записи становится QueueBookkeepingError с операцией", async () => {
    const cause = redisTimeout();
    const error = await recordJobFate("dead-letter", async () => {
      throw cause;
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(QueueBookkeepingError);
    expect((error as QueueBookkeepingError).operation).toBe("dead-letter");
    expect((error as QueueBookkeepingError).cause).toBe(cause);

    const inner = new QueueBookkeepingError("retry", cause);
    await expect(
      recordJobFate("dead-letter", async () => {
        throw inner;
      }),
    ).rejects.toBe(inner);
  });

  /**
   * worker.ts не импортируется в тесте (запускает воркер на импорте) — проводка
   * проверяется по исходнику: обе записи судьбы идут через `recordJobFate`,
   * алерт о мёртвой задаче — только после записи, подтверждение — только при
   * записанной судьбе.
   */
  it("воркер подтверждает задачу, только если её судьба записана", () => {
    const worker = readFileSync(resolve(process.cwd(), "src/worker.ts"), "utf8").replace(/\r\n/g, "\n");
    const body = (name: string) => {
      const start = worker.indexOf(`async function ${name}(`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      return worker.slice(start, worker.indexOf("\n}\n", start));
    };

    expect(body("enqueueRetry")).toMatch(/await recordJobFate\("retry", \(\) => enqueue\(/);
    expect(body("moveToDeadQueue")).toMatch(
      /await recordJobFate\("dead-letter", \(\) => enqueueDeadJob\([\s\S]*alertDeadJobs\(1\)/,
    );
    expect(body("processJob")).toMatch(
      /const settled = await settleFailedJob\(job, error, \{[\s\S]*?\}\);\s*if \(!settled\) return;\s*\}\s*await acknowledge\(job\);\s*$/,
    );
  });
});
