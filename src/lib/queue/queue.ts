import { randomUUID } from "crypto";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { logError } from "@/lib/logging/logger";
import type { Job } from "@/lib/queue/types";
import { isJob, normalizeJobMeta } from "@/lib/queue/types";
import { isProduction } from "@/lib/env";

const QUEUE_KEY = "queue:jobs";
const PROCESSING_KEY = "queue:processing";
const DEAD_KEY = "queue:dead";
// FIX-12/15 (HARDENING-07): side hash `jobId → last-heartbeat-ts`. Decouples a
// job's processing start-time / lease from the list element so the job never has
// to be re-written in place (no lRem+rPush limbo window), and so recovery keys
// off a live heartbeat instead of a fixed-from-start timeout.
const PROCESSING_HEARTBEAT_KEY = "queue:processing:heartbeat";
// FIX-15: lease staleness threshold. A job is only "stuck" if its heartbeat
// hasn't been refreshed for this long — a live long-running job (heartbeated by
// the worker) is never re-queued.
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RECOVERY_ATTEMPTS = 3;
const allowMemoryQueueFallback = !isProduction;

const memoryQueue: Job[] = [];
const memoryProcessing: Job[] = [];
const memoryDead: Job[] = [];
const memoryHeartbeat = new Map<string, number>();

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

function runQueueRedisCommand<T>(operation: string, promise: Promise<T>): Promise<T> {
  return withRedisCommandTimeout(`queue:${operation}`, promise);
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

function withoutProcessingTimestamp(job: Job): Job {
  const cleared = { ...job };
  delete cleared._processingStartedAt;
  return normalizeJobMeta(cleared);
}

async function setJobHeartbeat(jobId: string, ts: number): Promise<void> {
  const client = await getQueueRedisConnection("setJobHeartbeat");
  if (!client) {
    memoryHeartbeat.set(jobId, ts);
    return;
  }
  await runQueueRedisCommand(
    "setJobHeartbeat:hSet",
    client.hSet(PROCESSING_HEARTBEAT_KEY, jobId, String(ts))
  );
}

async function clearJobHeartbeat(jobId: string): Promise<void> {
  const client = await getQueueRedisConnection("clearJobHeartbeat");
  if (!client) {
    memoryHeartbeat.delete(jobId);
    return;
  }
  await runQueueRedisCommand(
    "clearJobHeartbeat:hDel",
    client.hDel(PROCESSING_HEARTBEAT_KEY, jobId)
  );
}

/**
 * FIX-15: the worker calls this periodically while a job runs, renewing its
 * lease so `recoverStuckJobs` never re-queues a live long-running job. Best-effort
 * — a failed heartbeat at worst risks an early (recovery is attempt-bounded and,
 * for non-idempotent jobs, deduped) re-queue, never job loss.
 */
export async function heartbeatJob(jobId: string): Promise<void> {
  try {
    await setJobHeartbeat(jobId, Date.now());
  } catch (error) {
    if (isQueueRedisRequiredError(error)) return;
    logError("Queue heartbeat failed", {
      jobId,
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}

async function removeProcessingById(jobId: string): Promise<boolean> {
  const client = await getQueueRedisConnection("removeProcessingById");
  if (!client) {
    const index = memoryProcessing.findIndex((item) => item.id === jobId);
    if (index === -1) return false;
    memoryProcessing.splice(index, 1);
    return true;
  }

  const items = await runQueueRedisCommand(
    "removeProcessingById:lRange",
    client.lRange(PROCESSING_KEY, 0, -1)
  );
  const matchedRaw = items.find((raw) => parseJob(raw)?.id === jobId);
  if (!matchedRaw) return false;
  const removed = await runQueueRedisCommand(
    "removeProcessingById:lRem",
    client.lRem(PROCESSING_KEY, 1, matchedRaw)
  );
  return removed > 0;
}

async function removeListItemByIndex(key: string, index: number): Promise<boolean> {
  const client = await getQueueRedisConnection("removeListItemByIndex");
  if (!client) return false;

  const marker = `__queue_marker__:${randomUUID()}`;
  try {
    await runQueueRedisCommand("removeListItemByIndex:lSet", client.lSet(key, index, marker));
  } catch {
    return false;
  }
  const removed = await runQueueRedisCommand("removeListItemByIndex:lRem", client.lRem(key, 1, marker));
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
    await runQueueRedisCommand("enqueue:rPush", client.rPush(QUEUE_KEY, JSON.stringify(queuedJob)));
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

      const job = normalizeJobMeta(nextJob);
      if (isScheduledForFuture(job)) {
        memoryQueue.push(job); // not due yet — back to the queue, unprocessed
        return null;
      }

      memoryProcessing.push(job);
      memoryHeartbeat.set(job.id, Date.now());
      return job;
    }

    const raw = await runQueueRedisCommand(
      "dequeue:lMove",
      client.lMove(QUEUE_KEY, PROCESSING_KEY, "LEFT", "RIGHT")
    );
    if (!raw) return null;

    const job = parseJob(raw);
    if (!job) {
      await runQueueRedisCommand("dequeue:cleanupInvalid", client.lRem(PROCESSING_KEY, 1, raw));
      logError("Queue job parse failed", { raw });
      return null;
    }

    // Not due yet → return it to the queue without processing. Add-to-queue
    // BEFORE removing from processing, so a crash here duplicates the job
    // (recoverable) rather than loses it.
    if (isScheduledForFuture(job)) {
      await runQueueRedisCommand("dequeue:rPushScheduledBack", client.rPush(QUEUE_KEY, raw));
      await runQueueRedisCommand("dequeue:lRemScheduled", client.lRem(PROCESSING_KEY, 1, raw));
      return null;
    }

    // FIX-12: the job stays in PROCESSING exactly as `lMove` left it — its
    // start-time (initial heartbeat) is recorded in the side hash keyed by
    // job.id. No lRem+rPush → there is no window where the job is in neither
    // list. A crash between `lMove` and this hSet leaves the job in PROCESSING
    // with no heartbeat, which recovery treats as recoverable (never lost).
    await runQueueRedisCommand(
      "dequeue:hSetHeartbeat",
      client.hSet(PROCESSING_HEARTBEAT_KEY, job.id, String(Date.now()))
    );
    return job;
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
    // FIX-12: the processing entry is the original enqueued string (no in-place
    // stamp), so remove by job.id rather than by an exact serialization match,
    // then drop the side-hash entry so it can't leak.
    const removed = await removeProcessingById(job.id);
    if (!removed) {
      logError("acknowledge: job not found in processing queue", { jobId: job.id, __skipAlert: true });
    }
    await clearJobHeartbeat(job.id);
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
    await runQueueRedisCommand("enqueueDeadJob:rPush", client.rPush(DEAD_KEY, JSON.stringify(deadJob)));
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
      const liveIds = new Set<string>();

      for (const job of memoryProcessing) {
        const hb = memoryHeartbeat.get(job.id);

        // FIX-12: no heartbeat → the job is in processing but was never stamped
        // (crash between dequeue's push and the heartbeat write, or a legacy
        // job). Adopt it THIS cycle (stamp now) and keep it — this avoids racing
        // a job that was just dequeued and is about to be processed. If it's
        // truly orphaned, its adopted stamp goes stale and it recovers next cycle.
        if (hb === undefined) {
          memoryHeartbeat.set(job.id, now);
          remaining.push(job);
          liveIds.add(job.id);
          continue;
        }

        // FIX-15: only re-queue when the LEASE is stale (no heartbeat for the
        // timeout), never on a fixed-from-start clock — a live long-running job
        // keeps refreshing its heartbeat and is never re-queued.
        if (now - hb <= PROCESSING_TIMEOUT_MS) {
          remaining.push(job);
          liveIds.add(job.id);
          continue;
        }

        memoryHeartbeat.delete(job.id);
        const attempts = (job.attempts ?? 0) + 1;
        if (attempts <= MAX_RECOVERY_ATTEMPTS) {
          memoryQueue.unshift(
            normalizeJobMeta({ ...withoutProcessingTimestamp(job), attempts, _recoveredAt: now })
          );
          recovered += 1;
          logError("Recovered stuck job", { jobId: job.id, attempts, __skipAlert: true });
        } else {
          memoryDead.push(
            normalizeJobMeta({ ...withoutProcessingTimestamp(job), attempts, failedAt: now })
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
      // Prune orphan heartbeat entries (job no longer in processing — e.g. a
      // failed clear on ack) so the map can't grow unbounded.
      for (const id of [...memoryHeartbeat.keys()]) {
        if (!liveIds.has(id)) memoryHeartbeat.delete(id);
      }
      return recovered;
    }

    const items = await runQueueRedisCommand(
      "recoverStuckJobs:lRange",
      client.lRange(PROCESSING_KEY, 0, -1)
    );
    const heartbeats = await runQueueRedisCommand(
      "recoverStuckJobs:hGetAll",
      client.hGetAll(PROCESSING_HEARTBEAT_KEY)
    );
    const now = Date.now();
    const liveIds = new Set<string>();

    for (const raw of items) {
      const job = parseJob(raw);
      if (!job) {
        await runQueueRedisCommand("recoverStuckJobs:dropInvalid", client.lRem(PROCESSING_KEY, 1, raw));
        continue;
      }

      const hbRaw = heartbeats[job.id];
      const hb = hbRaw !== undefined ? Number(hbRaw) : NaN;

      // FIX-12: no heartbeat → adopt this cycle (race-safe), recover next if dead.
      if (Number.isNaN(hb)) {
        await runQueueRedisCommand(
          "recoverStuckJobs:adopt",
          client.hSet(PROCESSING_HEARTBEAT_KEY, job.id, String(now))
        );
        liveIds.add(job.id);
        continue;
      }

      // FIX-15: fresh lease → live worker → leave it running.
      if (now - hb <= PROCESSING_TIMEOUT_MS) {
        liveIds.add(job.id);
        continue;
      }

      // Stale lease → dead worker → recover exactly once.
      await runQueueRedisCommand("recoverStuckJobs:lRem", client.lRem(PROCESSING_KEY, 1, raw));
      await runQueueRedisCommand("recoverStuckJobs:hDel", client.hDel(PROCESSING_HEARTBEAT_KEY, job.id));

      const attempts = (job.attempts ?? 0) + 1;
      if (attempts <= MAX_RECOVERY_ATTEMPTS) {
        const recoveredJob = normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts,
          _recoveredAt: now,
        });
        await runQueueRedisCommand("recoverStuckJobs:lPush", client.lPush(QUEUE_KEY, JSON.stringify(recoveredJob)));
        recovered += 1;
        logError("Recovered stuck job", { jobId: job.id, attempts, __skipAlert: true });
      } else {
        const deadJob = normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts,
          failedAt: now,
        });
        await runQueueRedisCommand("recoverStuckJobs:rPushDead", client.rPush(DEAD_KEY, JSON.stringify(deadJob)));
        logError("Job permanently failed — too many attempts", {
          jobId: job.id,
          attempts,
          __skipAlert: true,
        });
      }
    }

    // Prune orphan heartbeat entries (in the hash but no longer in processing).
    for (const id of Object.keys(heartbeats)) {
      if (!liveIds.has(id)) {
        await runQueueRedisCommand(
          "recoverStuckJobs:pruneOrphan",
          client.hDel(PROCESSING_HEARTBEAT_KEY, id)
        );
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
    return await runQueueRedisCommand("getQueueLength:lLen", client.lLen(QUEUE_KEY));
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
      runQueueRedisCommand("getQueueStats:lLenPending", client.lLen(QUEUE_KEY)),
      runQueueRedisCommand("getQueueStats:lLenProcessing", client.lLen(PROCESSING_KEY)),
      runQueueRedisCommand("getQueueStats:lLenDead", client.lLen(DEAD_KEY)),
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

    const total = await runQueueRedisCommand("listDeadJobs:lLen", client.lLen(DEAD_KEY));
    if (total === 0) return [];

    const start = Math.max(total - safeLimit, 0);
    const raws = await runQueueRedisCommand("listDeadJobs:lRange", client.lRange(DEAD_KEY, start, -1));
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

    const raw = await runQueueRedisCommand("retryDeadJobByIndex:lIndex", client.lIndex(DEAD_KEY, queueIndex));
    if (!raw) return false;

    const job = parseJob(raw);
    const removed = await removeListItemByIndex(DEAD_KEY, queueIndex);
    if (!removed || !job) return false;

    await runQueueRedisCommand(
      "retryDeadJobByIndex:lPush",
      client.lPush(
        QUEUE_KEY,
        JSON.stringify(
          normalizeJobMeta({
            ...withoutProcessingTimestamp(job),
            attempts: 0,
          })
        )
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
