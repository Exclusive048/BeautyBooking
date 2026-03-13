import { randomUUID } from "crypto";
import { getRedisConnection } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import type { Job } from "@/lib/queue/types";
import { isJob, normalizeJobMeta } from "@/lib/queue/types";

const QUEUE_KEY = "queue:jobs";
const PROCESSING_KEY = "queue:processing";
const DEAD_KEY = "queue:dead";
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 3;
const allowMemoryQueueFallback = process.env.NODE_ENV !== "production";

const memoryQueue: Job[] = [];
const memoryProcessing: Job[] = [];
const memoryDead: Job[] = [];

type QueueRedisClient = NonNullable<Awaited<ReturnType<typeof getRedisConnection>>>;
type QueueRedisRequiredError = Error & { code: "REDIS_REQUIRED_FOR_QUEUE" };

function createQueueRedisRequiredError(operation: string): QueueRedisRequiredError {
  const error = new Error(`Redis is required for queue operation: ${operation}`) as QueueRedisRequiredError;
  error.code = "REDIS_REQUIRED_FOR_QUEUE";
  return error;
}

function isQueueRedisRequiredError(error: unknown): error is QueueRedisRequiredError {
  if (!error || typeof error !== "object") return false;
  return (error as { code?: string }).code === "REDIS_REQUIRED_FOR_QUEUE";
}

async function getQueueRedisConnection(operation: string): Promise<QueueRedisClient | null> {
  const client = await getRedisConnection();
  if (client) return client;
  if (allowMemoryQueueFallback) return null;
  throw createQueueRedisRequiredError(operation);
}

export type QueueStats = {
  pending: number;
  processing: number;
  dead: number;
};

export type DeadQueueJobItem = {
  queueIndex: number;
  job: Job;
};

function parseJob(raw: string): Job | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isJob(parsed) ? normalizeJobMeta(parsed) : null;
  } catch {
    return null;
  }
}

function toJobScheduleAt(job: Job): number | null {
  const scheduleAt = job.scheduledAt ?? job.runAt;
  return typeof scheduleAt === "number" ? scheduleAt : null;
}

function isScheduledForFuture(job: Job): boolean {
  const scheduleAt = toJobScheduleAt(job);
  return typeof scheduleAt === "number" && scheduleAt > Date.now();
}

function normalizeScheduledFields(job: Job): Job {
  const scheduleAt = toJobScheduleAt(job);
  return {
    ...job,
    runAt: scheduleAt ?? undefined,
    scheduledAt: scheduleAt ?? undefined,
  };
}

type EnqueueOptions = {
  delayMs?: number;
};

function applyEnqueueDelay(job: Job, options?: EnqueueOptions): Job {
  const normalized = normalizeJobMeta(normalizeScheduledFields(job));
  const delayMs = options?.delayMs ?? 0;
  if (!Number.isFinite(delayMs) || delayMs <= 0) {
    return normalized;
  }

  const scheduledAt = Date.now() + Math.floor(delayMs);
  return {
    ...normalized,
    scheduledAt,
    runAt: scheduledAt,
  };
}

function withProcessingTimestamp(job: Job): Job {
  return normalizeJobMeta({
    ...job,
    _processingStartedAt: Date.now(),
  });
}

function withoutProcessingTimestamp(job: Job): Job {
  const cleared = { ...job };
  delete cleared._processingStartedAt;
  return normalizeJobMeta(cleared);
}

async function removeProcessingById(jobId: string): Promise<boolean> {
  const client = await getQueueRedisConnection("removeProcessingById");
  if (!client) {
    const index = memoryProcessing.findIndex((item) => item.id === jobId);
    if (index === -1) return false;
    memoryProcessing.splice(index, 1);
    return true;
  }

  const items = await client.lRange(PROCESSING_KEY, 0, -1);
  const matchedRaw = items.find((raw) => parseJob(raw)?.id === jobId);
  if (!matchedRaw) return false;
  const removed = await client.lRem(PROCESSING_KEY, 1, matchedRaw);
  return removed > 0;
}

async function removeListItemByIndex(key: string, index: number): Promise<boolean> {
  const client = await getQueueRedisConnection("removeListItemByIndex");
  if (!client) return false;

  const marker = `__queue_marker__:${randomUUID()}`;
  try {
    await client.lSet(key, index, marker);
  } catch {
    return false;
  }
  const removed = await client.lRem(key, 1, marker);
  return removed > 0;
}

export async function enqueue(job: Job, options?: EnqueueOptions): Promise<void> {
  const queuedJob = applyEnqueueDelay(job, options);
  try {
    const client = await getQueueRedisConnection("enqueue");
    if (!client) {
      memoryQueue.push(queuedJob);
      return;
    }
    await client.rPush(QUEUE_KEY, JSON.stringify(queuedJob));
  } catch (error) {
    logError("Queue enqueue failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function dequeue(): Promise<Job | null> {
  try {
    const client = await getQueueRedisConnection("dequeue");

    if (!client) {
      const nextJob = memoryQueue.shift() ?? null;
      if (!nextJob) return null;

      const processingJob = withProcessingTimestamp(nextJob);
      memoryProcessing.push(processingJob);

      if (isScheduledForFuture(processingJob)) {
        memoryProcessing.pop();
        memoryQueue.push(withoutProcessingTimestamp(processingJob));
        return null;
      }

      return processingJob;
    }

    const raw = await client.lMove(QUEUE_KEY, PROCESSING_KEY, "LEFT", "RIGHT");
    if (!raw) return null;

    const job = parseJob(raw);
    if (!job) {
      await client.lRem(PROCESSING_KEY, 1, raw);
      logError("Queue job parse failed", { raw });
      return null;
    }

    const processingJob = withProcessingTimestamp(job);
    const processingRaw = JSON.stringify(processingJob);

    await client.lRem(PROCESSING_KEY, 1, raw);
    await client.rPush(PROCESSING_KEY, processingRaw);

    if (isScheduledForFuture(processingJob)) {
      await client.lRem(PROCESSING_KEY, 1, processingRaw);
      await client.rPush(QUEUE_KEY, JSON.stringify(withoutProcessingTimestamp(processingJob)));
      return null;
    }

    return processingJob;
  } catch (error) {
    logError("Queue dequeue error", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (isQueueRedisRequiredError(error)) {
      throw error;
    }
    // TODO: add queue-degradation metric/alert when dequeue errors are frequent.
    return null;
  }
}

export async function acknowledge(job: Job): Promise<void> {
  try {
    const client = await getQueueRedisConnection("acknowledge");

    if (!client) {
      const removed = await removeProcessingById(job.id);
      if (!removed) {
        logError("acknowledge: job not found in processing queue", { jobId: job.id, __skipAlert: true });
      }
      return;
    }

    const serialized = JSON.stringify(job);
    const removed = await client.lRem(PROCESSING_KEY, 1, serialized);
    if (removed === 0) {
      const fallbackRemoved = await removeProcessingById(job.id);
      if (!fallbackRemoved) {
        logError("acknowledge: job not found in processing queue", { jobId: job.id, __skipAlert: true });
      }
    }
  } catch (error) {
    logError("Queue acknowledge error", {
      jobId: job.id,
      error: error instanceof Error ? error.message : String(error),
    });
    if (isQueueRedisRequiredError(error)) {
      throw error;
    }
  }
}

export async function enqueueDeadJob(job: Job): Promise<void> {
  const deadJob = normalizeJobMeta({
    ...withoutProcessingTimestamp(job),
    failedAt: Date.now(),
  });

  try {
    const client = await getQueueRedisConnection("enqueueDeadJob");
    if (!client) {
      memoryDead.push(deadJob);
      return;
    }
    await client.rPush(DEAD_KEY, JSON.stringify(deadJob));
  } catch (error) {
    logError("Queue dead-letter enqueue failed", {
      jobId: deadJob.id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function recoverStuckJobs(): Promise<number> {
  try {
    const client = await getQueueRedisConnection("recoverStuckJobs");
    let recovered = 0;

    if (!client) {
      const now = Date.now();
      const remaining: Job[] = [];

      for (const job of memoryProcessing) {
        const startedAt = job._processingStartedAt ?? 0;
        const isStuck = now - startedAt > PROCESSING_TIMEOUT_MS;

        if (!isStuck) {
          remaining.push(job);
          continue;
        }

        const attempts = (job.attempts ?? 0) + 1;
        if (attempts <= MAX_RECOVERY_ATTEMPTS) {
          memoryQueue.unshift(
            normalizeJobMeta({
              ...withoutProcessingTimestamp(job),
              attempts,
              _recoveredAt: now,
            })
          );
          recovered += 1;
          logError("Recovered stuck job", { jobId: job.id, attempts, __skipAlert: true });
        } else {
          memoryDead.push(
            normalizeJobMeta({
              ...withoutProcessingTimestamp(job),
              attempts,
              failedAt: now,
            })
          );
          logError("Job permanently failed — too many attempts", {
            jobId: job.id,
            attempts,
            __skipAlert: true,
          });
        }
      }

      memoryProcessing.length = 0;
      memoryProcessing.push(...remaining);
      return recovered;
    }

    const items = await client.lRange(PROCESSING_KEY, 0, -1);
    for (const raw of items) {
      const job = parseJob(raw);
      if (!job) {
        await client.lRem(PROCESSING_KEY, 1, raw);
        continue;
      }

      const startedAt = job._processingStartedAt ?? 0;
      const isStuck = Date.now() - startedAt > PROCESSING_TIMEOUT_MS;
      if (!isStuck) continue;

      await client.lRem(PROCESSING_KEY, 1, raw);

      const attempts = (job.attempts ?? 0) + 1;
      if (attempts <= MAX_RECOVERY_ATTEMPTS) {
        const recoveredJob = normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts,
          _recoveredAt: Date.now(),
        });
        await client.lPush(QUEUE_KEY, JSON.stringify(recoveredJob));
        recovered += 1;
        logError("Recovered stuck job", { jobId: job.id, attempts, __skipAlert: true });
      } else {
        const deadJob = normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts,
          failedAt: Date.now(),
        });
        await client.rPush(DEAD_KEY, JSON.stringify(deadJob));
        logError("Job permanently failed — too many attempts", {
          jobId: job.id,
          attempts,
          __skipAlert: true,
        });
      }
    }

    return recovered;
  } catch (error) {
    logError("recoverStuckJobs error", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (isQueueRedisRequiredError(error)) {
      throw error;
    }
    return 0;
  }
}

export async function getQueueLength(): Promise<number> {
  try {
    const client = await getQueueRedisConnection("getQueueLength");
    if (!client) {
      return memoryQueue.length;
    }
    return await client.lLen(QUEUE_KEY);
  } catch (error) {
    logError("Queue length check failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
    return -1;
  }
}

export async function getQueueStats(): Promise<QueueStats> {
  try {
    const client = await getQueueRedisConnection("getQueueStats");
    if (!client) {
      return {
        pending: memoryQueue.length,
        processing: memoryProcessing.length,
        dead: memoryDead.length,
      };
    }

    const [pending, processing, dead] = await Promise.all([
      client.lLen(QUEUE_KEY),
      client.lLen(PROCESSING_KEY),
      client.lLen(DEAD_KEY),
    ]);
    return { pending, processing, dead };
  } catch {
    return { pending: -1, processing: -1, dead: -1 };
  }
}

export async function listDeadJobs(limit = 50): Promise<DeadQueueJobItem[]> {
  const safeLimit = Math.max(1, Math.min(limit, 500));

  try {
    const client = await getQueueRedisConnection("listDeadJobs");
    if (!client) {
      const start = Math.max(memoryDead.length - safeLimit, 0);
      return memoryDead.slice(start).map((job, index) => ({
        queueIndex: start + index,
        job,
      }));
    }

    const total = await client.lLen(DEAD_KEY);
    if (total === 0) return [];

    const start = Math.max(total - safeLimit, 0);
    const raws = await client.lRange(DEAD_KEY, start, -1);
    const items: DeadQueueJobItem[] = [];

    raws.forEach((raw, index) => {
      const job = parseJob(raw);
      if (!job) return;
      items.push({ queueIndex: start + index, job });
    });

    return items;
  } catch (error) {
    logError("Queue dead-letter list failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
    return [];
  }
}

export async function retryDeadJobByIndex(index: number): Promise<boolean> {
  const queueIndex = Math.floor(index);
  if (!Number.isFinite(queueIndex) || queueIndex < 0) return false;

  try {
    const client = await getQueueRedisConnection("retryDeadJobByIndex");
    if (!client) {
      const job = memoryDead[queueIndex];
      if (!job) return false;
      memoryDead.splice(queueIndex, 1);
      memoryQueue.unshift(
        normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts: 0,
        })
      );
      return true;
    }

    const raw = await client.lIndex(DEAD_KEY, queueIndex);
    if (!raw) return false;

    const job = parseJob(raw);
    const removed = await removeListItemByIndex(DEAD_KEY, queueIndex);
    if (!removed || !job) return false;

    await client.lPush(
      QUEUE_KEY,
      JSON.stringify(
        normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts: 0,
        })
      )
    );

    return true;
  } catch (error) {
    logError("Queue dead-letter retry failed", {
      index: queueIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function deleteDeadJobByIndex(index: number): Promise<boolean> {
  const queueIndex = Math.floor(index);
  if (!Number.isFinite(queueIndex) || queueIndex < 0) return false;

  try {
    const client = await getQueueRedisConnection("deleteDeadJobByIndex");
    if (!client) {
      if (!memoryDead[queueIndex]) return false;
      memoryDead.splice(queueIndex, 1);
      return true;
    }

    return await removeListItemByIndex(DEAD_KEY, queueIndex);
  } catch (error) {
    logError("Queue dead-letter delete failed", {
      index: queueIndex,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
