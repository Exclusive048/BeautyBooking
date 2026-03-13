import "@/lib/startup";
import {
  acknowledge,
  dequeue,
  enqueue,
  enqueueDeadJob,
  getQueueStats,
  recoverStuckJobs,
} from "@/lib/queue/queue";
import { getRedisConnection } from "@/lib/redis/connection";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { logError, logInfo } from "@/lib/logging/logger";
import { alertCritical } from "@/lib/monitoring";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { processBookingReminder } from "@/lib/bookings/reminders";
import type { Job } from "@/lib/queue/types";
import {
  BOOKING_REMINDER_JOB_TYPE,
  DEFAULT_JOB_MAX_ATTEMPTS,
  MEDIA_CLEANUP_JOB_TYPE,
  TELEGRAM_SEND_JOB_TYPE,
  VISUAL_SEARCH_INDEX_JOB_TYPE,
  YOOKASSA_WEBHOOK_JOB_TYPE,
  createMediaCleanupJob,
  normalizeJobMeta,
} from "@/lib/queue/types";
import { runHotSlotExpiringJob } from "@/lib/hot-slots/job";
import { runBookingReviewPromptJob } from "@/lib/bookings/review-prompts";
import {
  indexMediaAsset,
  isVisualSearchMissingAssetError,
  isVisualSearchRetryableError,
} from "@/lib/visual-search/indexer";
import { ensureVisualSearchStartupConfig, getVisualSearchConfig } from "@/lib/visual-search/config";
import { processYookassaWebhookPayload } from "@/lib/payments/yookassa/webhook-processor";
import { runMediaCleanup } from "@/lib/media/cleanup";

ensureVisualSearchStartupConfig();

let isShuttingDown = false;
let lastHealthcheckAt = 0;
let jobsProcessed = 0;
let workerSecretMissingLogged = false;

const HEALTHCHECK_INTERVAL_MS = 30_000;
const STUCK_RECOVERY_INTERVAL_MS = 2 * 60 * 1000;
const QUEUE_STATS_CHECK_EVERY_JOBS = 100;
const QUEUE_PENDING_OVERLOAD_THRESHOLD = 1000;
const QUEUE_DEAD_THRESHOLD = 10;
const QUEUE_PROCESSING_THRESHOLD = 50;
const WORKER_RETRY_MAX_ATTEMPTS = 3;

process.on("uncaughtException", (error) => {
  logError("Worker uncaughtException", {
    error: error.message,
    stack: error.stack,
  });
  void alertCritical("Worker процесс упал (uncaughtException)", {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logError("Worker unhandledRejection", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  void alertCritical("Worker процесс упал (unhandledRejection)", {
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
  process.exit(1);
});

process.on("SIGTERM", () => {
  isShuttingDown = true;
});

process.on("SIGINT", () => {
  isShuttingDown = true;
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startPeriodicJobs() {
  const intervalMs = 30 * 60 * 1000;
  setInterval(() => {
    void runHotSlotExpiringJob().catch((error) => {
      logError("Hot slot expiring job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
    void runBookingReviewPromptJob().catch((error) => {
      logError("Booking review prompt job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, intervalMs);

  const mediaCleanupIntervalMs = 60 * 60 * 1000;
  setInterval(() => {
    void enqueue(createMediaCleanupJob()).catch((error) => {
      logError("Failed to enqueue media cleanup job", {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }, mediaCleanupIntervalMs);
}

function getRetryDelaySeconds(attempts: number): number {
  return Math.min(60, 2 ** attempts);
}

async function enqueueRetry(job: Job, delayMs: number): Promise<void> {
  const retryJob = { ...job };
  delete retryJob._processingStartedAt;
  await enqueue(normalizeJobMeta(retryJob), { delayMs });
}

function resolveHealthcheckUrl(): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.APP_PUBLIC_URL ??
    "http://127.0.0.1:3000"
  ).trim();
  return `${appUrl.replace(/\/+$/, "")}/api/health/worker`;
}

function resolveWorkerSecret(): string | null {
  const secret = process.env.WORKER_SECRET?.trim();
  return secret && secret.length > 0 ? secret : null;
}

async function ensureWorkerRedisReady(): Promise<void> {
  if (process.env.NODE_ENV !== "production") return;

  const redis = await getRedisConnection();
  if (!redis) {
    throw new Error("Redis is required for worker in production");
  }

  await redis.ping();
}

async function pingHealthcheck(): Promise<void> {
  const workerSecret = resolveWorkerSecret();
  if (!workerSecret) {
    if (!workerSecretMissingLogged) {
      logInfo("Worker healthcheck ping skipped: WORKER_SECRET is not configured");
      workerSecretMissingLogged = true;
    }
    return;
  }

  const healthcheckUrl = resolveHealthcheckUrl();

  try {
    await fetch(healthcheckUrl, {
      method: "POST",
      headers: {
        "x-worker-secret": workerSecret,
      },
    });
  } catch (error) {
    logError("Worker healthcheck ping failed", {
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}

async function maybePingHealthcheck(): Promise<void> {
  const now = Date.now();
  if (now - lastHealthcheckAt < HEALTHCHECK_INTERVAL_MS) return;
  lastHealthcheckAt = now;
  await pingHealthcheck();
}

async function monitorQueueStatsIfNeeded(): Promise<void> {
  jobsProcessed += 1;
  if (jobsProcessed % QUEUE_STATS_CHECK_EVERY_JOBS !== 0) return;

  const stats = await getQueueStats();
  logInfo("Queue stats", { ...stats, jobsProcessed });

  if (stats.pending > QUEUE_PENDING_OVERLOAD_THRESHOLD) {
    sendTelegramAlert(
      `\uD83D\uDEA8 \u041E\u0447\u0435\u0440\u0435\u0434\u044C \u043F\u0435\u0440\u0435\u0433\u0440\u0443\u0436\u0435\u043D\u0430: ${stats.pending} \u0437\u0430\u0434\u0430\u0447 \u043E\u0436\u0438\u0434\u0430\u044E\u0442`,
      "queue:pending:overloaded"
    );
  }
  if (stats.dead > QUEUE_DEAD_THRESHOLD) {
    sendTelegramAlert(
      `\u26A0\uFE0F Dead letter queue: ${stats.dead} \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C`,
      "queue:dead:overloaded"
    );
  }
  if (stats.processing > QUEUE_PROCESSING_THRESHOLD) {
    sendTelegramAlert(
      `\u26A0\uFE0F \u041C\u043D\u043E\u0433\u043E \u0437\u0430\u0434\u0430\u0447 \u0432 \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u043A\u0435: ${stats.processing} \u2014 \u0432\u043E\u0437\u043C\u043E\u0436\u043D\u044B \u0437\u0430\u0432\u0438\u0441\u0448\u0438\u0435`,
      "queue:processing:high"
    );
  }
}

function getJobAttempts(job: Job): number {
  return job.attempts ?? 0;
}

function getJobMaxAttempts(job: Job): number {
  return job.maxAttempts ?? DEFAULT_JOB_MAX_ATTEMPTS;
}

function getJobScheduleAt(job: Job): number | null {
  const scheduleAt = job.scheduledAt ?? job.runAt;
  return typeof scheduleAt === "number" ? scheduleAt : null;
}

async function moveToDeadQueue(job: Job): Promise<void> {
  await enqueueDeadJob(normalizeJobMeta(job));
}

async function processTelegramSend(
  job: Extract<Job, { type: typeof TELEGRAM_SEND_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  const ok = await sendTelegramMessage(job.payload.chatId, job.payload.text);
  if (ok) return;

  const nextAttempts = getJobAttempts(job) + 1;
  if (nextAttempts < getJobMaxAttempts(job)) {
    const delaySeconds = getRetryDelaySeconds(nextAttempts);
    await enqueueRetry(
      {
        ...job,
        attempts: nextAttempts,
      },
      delaySeconds * 1000
    );
    return;
  }

  await moveToDeadQueue({ ...job, attempts: nextAttempts });
  logError("Worker dead letter job", {
    jobId: job.id,
    type: job.type,
    attempts: nextAttempts,
    maxAttempts: getJobMaxAttempts(job),
    __skipAlert: true,
  });
}

async function processBookingReminderJob(
  job: Extract<Job, { type: typeof BOOKING_REMINDER_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  try {
    await processBookingReminder(job.payload);
  } catch (error) {
    const attempts = getJobAttempts(job);
    if (attempts < WORKER_RETRY_MAX_ATTEMPTS) {
      logError("Reminder job failed, will retry", {
        jobId: job.id,
        attempts,
        error: error instanceof Error ? error.message : String(error),
      });
      await enqueueRetry(
        {
          ...job,
          attempts: attempts + 1,
        },
        60_000 * (attempts + 1)
      );
      return;
    }

    await moveToDeadQueue({ ...job, attempts });
    logError("Reminder job permanently failed after 3 attempts", {
      jobId: job.id,
      attempts,
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}

async function processVisualSearchIndexJob(
  job: Extract<Job, { type: typeof VISUAL_SEARCH_INDEX_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  try {
    const config = await getVisualSearchConfig();
    if (!config.enabled) {
      logInfo("Visual search disabled - skipping indexing", {
        jobId: job.id,
        assetId: job.payload.assetId,
      });
      return;
    }

    await indexMediaAsset(job.payload.assetId);
  } catch (error) {
    if (isVisualSearchMissingAssetError(error)) {
      logError("Worker visual search job skipped: asset file missing", {
        jobId: job.id,
        type: job.type,
        assetId: job.payload.assetId,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const nextAttempts = getJobAttempts(job) + 1;
    if (isVisualSearchRetryableError(error) && nextAttempts < getJobMaxAttempts(job)) {
      const delaySeconds = getRetryDelaySeconds(nextAttempts);
      await enqueueRetry(
        {
          ...job,
          attempts: nextAttempts,
        },
        delaySeconds * 1000
      );
      return;
    }

    await moveToDeadQueue({ ...job, attempts: nextAttempts });
    logError("Worker visual search job failed", {
      jobId: job.id,
      type: job.type,
      assetId: job.payload.assetId,
      attempts: nextAttempts,
      maxAttempts: getJobMaxAttempts(job),
      error: error instanceof Error ? error.message : String(error),
      __skipAlert: true,
    });
  }
}

async function processYookassaWebhookJob(
  job: Extract<Job, { type: typeof YOOKASSA_WEBHOOK_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  await processYookassaWebhookPayload(job.payload);
}

async function processMediaCleanupJob(
  job: Extract<Job, { type: typeof MEDIA_CLEANUP_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  await runMediaCleanup();
}

async function processJob(job: Job): Promise<void> {
  try {
    if (job.type === TELEGRAM_SEND_JOB_TYPE) {
      await processTelegramSend(job);
      return;
    }

    if (job.type === BOOKING_REMINDER_JOB_TYPE) {
      await processBookingReminderJob(job);
      return;
    }

    if (job.type === VISUAL_SEARCH_INDEX_JOB_TYPE) {
      await processVisualSearchIndexJob(job);
      return;
    }

    if (job.type === YOOKASSA_WEBHOOK_JOB_TYPE) {
      await processYookassaWebhookJob(job);
      return;
    }

    if (job.type === MEDIA_CLEANUP_JOB_TYPE) {
      await processMediaCleanupJob(job);
      return;
    }

    const unknownJob = job as unknown as { id?: string; type?: string };
    logError("Worker received unknown job type", {
      jobId: unknownJob.id ?? "unknown",
      type: unknownJob.type ?? "unknown",
      __skipAlert: true,
    });
  } catch (error) {
    logError("Worker job processing failed", {
      jobId: job.id,
      type: job.type,
      error: error instanceof Error ? error.message : String(error),
    });

    const attempts = getJobAttempts(job);
    if (attempts < WORKER_RETRY_MAX_ATTEMPTS) {
      const nextAttempts = attempts + 1;
      const retryDelayMs = 60_000 * nextAttempts;
      await enqueue(
        normalizeJobMeta({
          ...job,
          attempts: nextAttempts,
          scheduledAt: Date.now() + retryDelayMs,
          runAt: Date.now() + retryDelayMs,
        })
      );
    } else {
      await moveToDeadQueue({ ...job, attempts });
    }
  } finally {
    await acknowledge(job);
  }
}

async function runLoop() {
  startPeriodicJobs();

  setInterval(() => {
    void recoverStuckJobs()
      .then((recovered) => {
        if (recovered > 0) {
          logInfo("Periodic recovery: stuck jobs recovered", { recovered });
        }
      })
      .catch((error) => {
        logError("Periodic stuck-job recovery failed", {
          error: error instanceof Error ? error.message : String(error),
          __skipAlert: true,
        });
      });
  }, STUCK_RECOVERY_INTERVAL_MS);

  while (!isShuttingDown) {
    await maybePingHealthcheck();

    const job = await dequeue();
    if (!job) {
      await sleep(1000);
      continue;
    }

    await processJob(job);
    await monitorQueueStatsIfNeeded();
  }

  logInfo("Worker shutdown complete");
}

async function startWorker() {
  await ensureWorkerRedisReady();

  logInfo("Worker starting — recovering stuck jobs...");
  const recovered = await recoverStuckJobs();
  if (recovered > 0) {
    logInfo("Recovered stuck jobs", { recovered });
    sendTelegramAlert(
      `\u26A0\uFE0F \u0412\u043E\u0440\u043A\u0435\u0440 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0449\u0435\u043D, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E ${recovered} \u0437\u0430\u0432\u0438\u0441\u0448\u0438\u0445 \u0437\u0430\u0434\u0430\u0447`,
      "worker:recovered-stuck-jobs"
    );
  }

  logInfo("Worker started");
  await runLoop();
  process.exit(0);
}

startWorker().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError("Worker stopped", { error: message });
  process.exit(1);
});
