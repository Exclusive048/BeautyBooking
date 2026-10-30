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
// QUEUE-RETRY-POLICY-PER-TYPE: предел — на ВОССТАНОВЛЕНИЯ (`_recoveries`), а не
// на `attempts`. С длинными расписаниями повторов (`yookassa.webhook` — до 12
// попыток) счёт по `attempts` убивал бы задачу, у которой просто прошло
// несколько обычных повторов, на первом же падении воркера посреди неё — а
// падения воркера при автодеплое штатны. `attempts` восстановление по-прежнему
// увеличивает: упавшее исполнение — тоже исполнение.
const MAX_RECOVERY_ATTEMPTS = 3;
const allowMemoryQueueFallback = !isProduction;

// QUEUE-DELAYED-ZSET (A-01): отложенные задачи живут отдельно от готовых —
// `queue:delayed` (ZSET, score = время запуска, member = id задачи) плюс хэш
// `queue:delayed:jobs` с самой задачей. Раньше всё лежало в одном списке
// `queue:jobs`, и `dequeue` на будущей задаче возвращал её в хвост и отвечал
// «пусто»: воркер засыпал на секунду, а тысяча напоминаний «за сутки» впереди
// срочной задачи означала тысячу секунд её ожидания. Теперь список содержит
// только готовое к работе, а созревшее переносит в него Lua-скрипт.
const DELAYED_KEY = "queue:delayed";
const DELAYED_JOBS_KEY = "queue:delayed:jobs";
// Сколько созревших задач один вызов скрипта переносит за раз и сколько
// таких пачек подряд допускается за один `dequeue`: скрипт блокирует Redis на
// время выполнения, поэтому пачка ограничена, а длинный хвост созревшего
// (воркер стоял) дотягивается следующими вызовами.
const PROMOTE_BATCH_SIZE = 100;
const PROMOTE_MAX_BATCHES = 10;
// Предел просмотра одного `dequeue` при самомиграции: каждая будущая задача,
// найденная в списке, уходит в ZSET, и цикл берёт следующую сразу. Предел —
// только страховка от бесконечного цикла; на проде он достижим лишь при
// первом запуске новой версии над длинным списком старого формата.
const DEQUEUE_SCAN_LIMIT = 5000;

/**
 * Атомарная постановка в отложенные. `ZADD NX` по id задачи: копия задачи с тем
 * же id (повтор той же цепочки, детерминированный id напоминания, сверка
 * платежа) не создаёт второй записи — побеждает первая. Хэш досоздаётся, даже
 * если член ZSET уже есть, а полезной нагрузки нет (ручная правка ключей).
 */
const ADD_DELAYED_SCRIPT = `
local added = redis.call('ZADD', KEYS[1], 'NX', ARGV[1], ARGV[2])
if added == 1 or redis.call('HEXISTS', KEYS[2], ARGV[2]) == 0 then
  redis.call('HSET', KEYS[2], ARGV[2], ARGV[3])
end
return added
`;

/**
 * Атомарный перенос созревших задач в готовые: выборка, удаление из ZSET и
 * хэша и `RPUSH` — в одном EVAL. Redis выполняет скрипт целиком, поэтому два
 * воркера, переносящих одновременно, не получат одну задачу дважды: второй
 * увидит ZSET уже без неё. Возвращает {перенесено, просмотрено} — по второму
 * числу видно, была ли пачка полной.
 */
const PROMOTE_DUE_SCRIPT = `
local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
local moved = 0
for _, id in ipairs(ids) do
  local payload = redis.call('HGET', KEYS[2], id)
  redis.call('ZREM', KEYS[1], id)
  redis.call('HDEL', KEYS[2], id)
  if payload then
    redis.call('RPUSH', KEYS[3], payload)
    moved = moved + 1
  end
end
return {moved, #ids}
`;

/** Для стенда очереди: тексты скриптов, чтобы двойник Redis мог их опознать. */
export const QUEUE_LUA_SCRIPTS = {
  addDelayed: ADD_DELAYED_SCRIPT,
  promoteDue: PROMOTE_DUE_SCRIPT,
} as const;

const memoryQueue: Job[] = [];
const memoryProcessing: Job[] = [];
const memoryDead: Job[] = [];
const memoryHeartbeat = new Map<string, number>();
const memoryDelayed = new Map<string, Job>();

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
  /** Готовые к работе (список `queue:jobs`). Отложенные сюда не входят. */
  pending: number;
  /** Отложенные до своего времени (`queue:delayed`): напоминания, повторы. */
  delayed: number;
  processing: number;
  dead: number;
  /**
   * Сколько ждёт задача в голове готовой очереди, от момента, когда она стала
   * готовой (поставлена, созрела или восстановлена). `null` — очередь пуста.
   */
  oldestPendingAgeMs: number | null;
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

/** Момент, с которого задача готова к работе: поставлена, созрела или восстановлена. */
function readySince(job: Job): number {
  return Math.max(job.createdAt ?? 0, toJobScheduleAt(job) ?? 0, job._recoveredAt ?? 0);
}

function addMemoryDelayed(job: Job): void {
  // Та же семантика, что `ZADD NX`: первая копия id остаётся.
  if (!memoryDelayed.has(job.id)) memoryDelayed.set(job.id, job);
}

function promoteMemoryDelayed(now: number): void {
  const due = [...memoryDelayed.values()]
    .filter((job) => (toJobScheduleAt(job) ?? 0) <= now)
    .sort((a, b) => (toJobScheduleAt(a) ?? 0) - (toJobScheduleAt(b) ?? 0));
  for (const job of due) {
    memoryDelayed.delete(job.id);
    memoryQueue.push(job);
  }
}

async function addDelayedJob(client: QueueRedisClient, operation: string, job: Job): Promise<void> {
  await runQueueRedisCommand(
    `${operation}:addDelayed`,
    client.eval(ADD_DELAYED_SCRIPT, {
      keys: [DELAYED_KEY, DELAYED_JOBS_KEY],
      arguments: [String(toJobScheduleAt(job) ?? Date.now()), job.id, JSON.stringify(job)],
    })
  );
}

/**
 * Единственная развилка «куда класть»: будущая задача — в ZSET, готовая — в
 * список (в хвост, а восстановленная и повторённая из dead-letter — в голову,
 * как и прежде). Все пути постановки идут через неё — иначе будущая задача
 * снова окажется в готовом списке и будет перекладываться при каждом чтении.
 */
async function placeJob(
  client: QueueRedisClient,
  operation: string,
  job: Job,
  side: "head" | "tail"
): Promise<void> {
  if (isScheduledForFuture(job)) {
    await addDelayedJob(client, operation, job);
    return;
  }
  const raw = JSON.stringify(job);
  await runQueueRedisCommand(
    `${operation}:${side === "head" ? "lPush" : "rPush"}`,
    side === "head" ? client.lPush(QUEUE_KEY, raw) : client.rPush(QUEUE_KEY, raw)
  );
}

function placeMemoryJob(job: Job, side: "head" | "tail"): void {
  if (isScheduledForFuture(job)) {
    addMemoryDelayed(job);
    return;
  }
  if (side === "head") memoryQueue.unshift(job);
  else memoryQueue.push(job);
}

/**
 * Перенос созревших отложенных задач в готовый список. Отказ не роняет
 * `dequeue`: готовые задачи в списке разбираются и без переноса, а созревшие
 * дождутся следующего вызова. Возвращает число перенесённых.
 */
async function promoteDueJobs(client: QueueRedisClient): Promise<number> {
  let moved = 0;
  try {
    for (let batch = 0; batch < PROMOTE_MAX_BATCHES; batch += 1) {
      const reply = await runQueueRedisCommand(
        "promoteDue:eval",
        client.eval(PROMOTE_DUE_SCRIPT, {
          keys: [DELAYED_KEY, DELAYED_JOBS_KEY, QUEUE_KEY],
          arguments: [String(Date.now()), String(PROMOTE_BATCH_SIZE)],
        })
      );
      const [batchMoved, scanned] = Array.isArray(reply) ? reply.map(Number) : [0, 0];
      moved += batchMoved || 0;
      if (!scanned || scanned < PROMOTE_BATCH_SIZE) break;
    }
  } catch (error) {
    logError("Queue delayed promotion failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
  return moved;
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
      placeMemoryJob(queuedJob, "tail");
      return;
    }
    await placeJob(client, "enqueue", queuedJob, "tail");
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
      promoteMemoryDelayed(Date.now());
      for (let scanned = 0; scanned < DEQUEUE_SCAN_LIMIT; scanned += 1) {
        const nextJob = memoryQueue.shift() ?? null;
        if (!nextJob) return null;

        const job = normalizeJobMeta(nextJob);
        if (isScheduledForFuture(job)) {
          addMemoryDelayed(job); // не созрела — в отложенные, берём следующую
          continue;
        }

        memoryProcessing.push(job);
        memoryHeartbeat.set(job.id, Date.now());
        return job;
      }
      return null;
    }

    await promoteDueJobs(client);

    // QUEUE-DELAYED-ZSET: самомиграция. Будущая задача в готовом списке —
    // наследие прежнего формата (до этой версии всё лежало в `queue:jobs`) или
    // писатель в обход `enqueue`. Раньше она возвращалась в хвост, а `dequeue`
    // отвечал «пусто», и воркер засыпал, хотя за ней могли стоять готовые.
    // Теперь она уходит в ZSET, и цикл сразу берёт следующую: сон — только
    // когда готовый список действительно пуст.
    for (let scanned = 0; scanned < DEQUEUE_SCAN_LIMIT; scanned += 1) {
      const raw = await runQueueRedisCommand(
        "dequeue:lMove",
        client.lMove(QUEUE_KEY, PROCESSING_KEY, "LEFT", "RIGHT")
      );
      if (!raw) return null;

      const job = parseJob(raw);
      if (!job) {
        await runQueueRedisCommand("dequeue:cleanupInvalid", client.lRem(PROCESSING_KEY, 1, raw));
        logError("Queue job parse failed", { raw });
        continue;
      }

      // Сначала в ZSET, потом из processing: сбой между шагами даёт копию
      // (recovery её подберёт, а `ZADD NX` по id не задвоит), а не потерю.
      if (isScheduledForFuture(job)) {
        await addDelayedJob(client, "dequeue:migrate", job);
        await runQueueRedisCommand("dequeue:lRemMigrated", client.lRem(PROCESSING_KEY, 1, raw));
        continue;
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
    }

    logError("Queue dequeue scan limit reached", { limit: DEQUEUE_SCAN_LIMIT, __skipAlert: true });
    return null;
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
        const recoveries = (job._recoveries ?? 0) + 1;
        if (recoveries <= MAX_RECOVERY_ATTEMPTS) {
          placeMemoryJob(
            normalizeJobMeta({
              ...withoutProcessingTimestamp(job),
              attempts,
              _recoveries: recoveries,
              _recoveredAt: now,
            }),
            "head"
          );
          recovered += 1;
          logError("Recovered stuck job", { jobId: job.id, attempts, recoveries, __skipAlert: true });
        } else {
          memoryDead.push(
            normalizeJobMeta({
              ...withoutProcessingTimestamp(job),
              attempts,
              _recoveries: recoveries,
              failedAt: now,
            })
          );
          logError("Job permanently failed — too many attempts", {
            jobId: job.id,
            attempts,
            recoveries,
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
      //
      // LOGIC-15: `lRem` — единственная точка сериализации на этом пути, и её
      // результат обязателен. Два воркера, прочитавшие один и тот же
      // просроченный элемент в одном тике восстановления, оба доходили сюда и
      // оба безусловно делали `lPush`/`rPush` — то есть «recover exactly once»
      // из комментария выше не выполнялся, и задача уезжала в очередь дважды.
      // Redis выполняет команды по одной, поэтому удаление элемента получит
      // ровно один из них: ненулевой ответ `lRem` и есть право на
      // восстановление. Проигравший НЕ трогает heartbeat и заносит id в
      // `liveIds` — иначе финальная прополка снесла бы отметку победителя (или
      // уже нового исполнителя), и следующий цикл счёл бы задачу бесхозной.
      const removed = await runQueueRedisCommand(
        "recoverStuckJobs:lRem",
        client.lRem(PROCESSING_KEY, 1, raw)
      );
      if (removed === 0) {
        liveIds.add(job.id);
        continue;
      }
      await runQueueRedisCommand("recoverStuckJobs:hDel", client.hDel(PROCESSING_HEARTBEAT_KEY, job.id));

      const attempts = (job.attempts ?? 0) + 1;
      const recoveries = (job._recoveries ?? 0) + 1;
      if (recoveries <= MAX_RECOVERY_ATTEMPTS) {
        const recoveredJob = normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts,
          _recoveries: recoveries,
          _recoveredAt: now,
        });
        // QUEUE-DELAYED-ZSET: будущая задача (застряла посреди самомиграции) —
        // в ZSET, готовая — в голову списка, как и прежде.
        await placeJob(client, "recoverStuckJobs", recoveredJob, "head");
        recovered += 1;
        logError("Recovered stuck job", { jobId: job.id, attempts, recoveries, __skipAlert: true });
      } else {
        const deadJob = normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts,
          _recoveries: recoveries,
          failedAt: now,
        });
        await runQueueRedisCommand("recoverStuckJobs:rPushDead", client.rPush(DEAD_KEY, JSON.stringify(deadJob)));
        logError("Job permanently failed — too many attempts", {
          jobId: job.id,
          attempts,
          recoveries,
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
      const head = memoryQueue[0];
      return {
        pending: memoryQueue.length,
        delayed: memoryDelayed.size,
        processing: memoryProcessing.length,
        dead: memoryDead.length,
        oldestPendingAgeMs: head ? Math.max(0, Date.now() - readySince(head)) : null,
      };
    }

    const [pending, delayed, processing, dead, headRaw] = await Promise.all([
      runQueueRedisCommand("getQueueStats:lLenPending", client.lLen(QUEUE_KEY)),
      runQueueRedisCommand("getQueueStats:zCardDelayed", client.zCard(DELAYED_KEY)),
      runQueueRedisCommand("getQueueStats:lLenProcessing", client.lLen(PROCESSING_KEY)),
      runQueueRedisCommand("getQueueStats:lLenDead", client.lLen(DEAD_KEY)),
      runQueueRedisCommand("getQueueStats:lIndexHead", client.lIndex(QUEUE_KEY, 0)),
    ]);
    const head = headRaw ? parseJob(headRaw) : null;
    return {
      pending,
      delayed,
      processing,
      dead,
      oldestPendingAgeMs: head ? Math.max(0, Date.now() - readySince(head)) : null,
    };
  } catch {
    return { pending: -1, delayed: -1, processing: -1, dead: -1, oldestPendingAgeMs: null };
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
      placeMemoryJob(
        normalizeJobMeta({
          ...withoutProcessingTimestamp(job),
          attempts: 0,
        }),
        "head"
      );
      return true;
    }

    const raw = await runQueueRedisCommand("retryDeadJobByIndex:lIndex", client.lIndex(DEAD_KEY, queueIndex));
    if (!raw) return false;

    const job = parseJob(raw);
    const removed = await removeListItemByIndex(DEAD_KEY, queueIndex);
    if (!removed || !job) return false;

    await placeJob(
      client,
      "retryDeadJobByIndex",
      normalizeJobMeta({
        ...withoutProcessingTimestamp(job),
        attempts: 0,
      }),
      "head"
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
