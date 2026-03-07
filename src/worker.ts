import { dequeue } from "@/lib/queue/queue";
import { enqueue } from "@/lib/queue/queue";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { logError } from "@/lib/logging/logger";
import { alertCritical } from "@/lib/monitoring";
import { processBookingReminder } from "@/lib/bookings/reminders";
import type { Job } from "@/lib/queue/types";
import {
  BOOKING_REMINDER_JOB_TYPE,
  TELEGRAM_SEND_JOB_TYPE,
  VISUAL_SEARCH_INDEX_JOB_TYPE,
} from "@/lib/queue/types";
import { runHotSlotExpiringJob } from "@/lib/hot-slots/job";
import { runBookingReviewPromptJob } from "@/lib/bookings/review-prompts";
import {
  indexMediaAsset,
  isVisualSearchMissingAssetError,
  isVisualSearchRetryableError,
} from "@/lib/visual-search/indexer";
import { ensureVisualSearchStartupConfig } from "@/lib/visual-search/config";

ensureVisualSearchStartupConfig();

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
}

function getRetryDelaySeconds(attempts: number): number {
  return Math.min(60, 2 ** attempts);
}

function enqueueRetry(job: Job, delayMs: number): void {
  const retryJob: Job = {
    ...job,
    runAt: Date.now() + delayMs,
  };

  setTimeout(() => {
    void enqueue(retryJob);
  }, delayMs);
}

async function processTelegramSend(
  job: Extract<Job, { type: typeof TELEGRAM_SEND_JOB_TYPE }>
): Promise<void> {
  if (typeof job.runAt === "number" && job.runAt > Date.now()) {
    enqueueRetry(job, job.runAt - Date.now());
    return;
  }

  const ok = await sendTelegramMessage(job.payload.chatId, job.payload.text);
  if (ok) return;

  const nextAttempts = job.attempts + 1;
  if (nextAttempts < job.maxAttempts) {
    const delaySeconds = getRetryDelaySeconds(nextAttempts);
    enqueueRetry(
      {
        ...job,
        attempts: nextAttempts,
      },
      delaySeconds * 1000
    );
    return;
  }

  logError("Worker dead letter job", {
    jobId: job.id,
    type: job.type,
    attempts: nextAttempts,
    maxAttempts: job.maxAttempts,
  });
}

async function processBookingReminderJob(
  job: Extract<Job, { type: typeof BOOKING_REMINDER_JOB_TYPE }>
): Promise<void> {
  if (typeof job.runAt === "number" && job.runAt > Date.now()) {
    enqueueRetry(job, job.runAt - Date.now());
    return;
  }

  await processBookingReminder(job.payload);
}

async function processVisualSearchIndexJob(
  job: Extract<Job, { type: typeof VISUAL_SEARCH_INDEX_JOB_TYPE }>
): Promise<void> {
  if (typeof job.runAt === "number" && job.runAt > Date.now()) {
    enqueueRetry(job, job.runAt - Date.now());
    return;
  }

  try {
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

    const nextAttempts = job.attempts + 1;
    if (isVisualSearchRetryableError(error) && nextAttempts < job.maxAttempts) {
      const delaySeconds = getRetryDelaySeconds(nextAttempts);
      enqueueRetry(
        {
          ...job,
          attempts: nextAttempts,
        },
        delaySeconds * 1000
      );
      return;
    }

    logError("Worker visual search job failed", {
      jobId: job.id,
      type: job.type,
      assetId: job.payload.assetId,
      attempts: nextAttempts,
      maxAttempts: job.maxAttempts,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function run() {
  startPeriodicJobs();
  while (true) {
    const job = await dequeue();
    if (job) {
      if (job.type === TELEGRAM_SEND_JOB_TYPE) {
        try {
          await processTelegramSend(job);
        } catch (error) {
          logError("Worker job processing failed", {
            jobId: job.id,
            type: job.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (job.type === BOOKING_REMINDER_JOB_TYPE) {
        try {
          await processBookingReminderJob(job);
        } catch (error) {
          logError("Worker job processing failed", {
            jobId: job.id,
            type: job.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } else if (job.type === VISUAL_SEARCH_INDEX_JOB_TYPE) {
        try {
          await processVisualSearchIndexJob(job);
        } catch (error) {
          logError("Worker job processing failed", {
            jobId: job.id,
            type: job.type,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      continue;
    }
    await sleep(500);
  }
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError("Worker stopped", { error: message });
});
