import { dequeue } from "@/lib/queue/queue";
import { enqueue } from "@/lib/queue/queue";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { logError } from "@/lib/logging/logger";
import { alertCritical } from "@/lib/monitoring";
import { processBookingReminder } from "@/lib/bookings/reminders";
import type { Job } from "@/lib/queue/types";
import { BOOKING_REMINDER_JOB_TYPE, TELEGRAM_SEND_JOB_TYPE } from "@/lib/queue/types";

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

async function run() {
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
