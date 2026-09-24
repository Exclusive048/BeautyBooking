import 'dotenv/config';
import "@/lib/startup";
import {
  acknowledge,
  dequeue,
  enqueue,
  enqueueDeadJob,
  getQueueStats,
  heartbeatJob,
  recoverStuckJobs,
} from "@/lib/queue/queue";
import { createHealthcheckPinger } from "@/lib/queue/healthcheck-ping";
import { getRedisConnection, withRedisCommandTimeout } from "@/lib/redis/connection";
import { sendTelegramMessage } from "@/lib/telegram/client";
import { getTelegramEnabled } from "@/lib/telegram/feature";
import { processVkSendPayload } from "@/lib/vk/notify";
import { logError, logInfo } from "@/lib/logging/logger";
import { alertCritical } from "@/lib/monitoring";
import { sendTelegramAlert } from "@/lib/monitoring/alerts";
import { alertDeadJobs } from "@/lib/monitoring/api-alerts";
import { recordSurfaceEvent } from "@/lib/monitoring/status";
import { env, isProduction } from "@/lib/env";
import { initServerObservability } from "@/lib/observability/server";
import { flushReports, reportError } from "@/lib/observability/report";
import { processBookingReminder, reconcileBookingReminders } from "@/lib/bookings/reminders";
import type { Job } from "@/lib/queue/types";
import {
  AVAILABLE_TODAY_RECOMPUTE_JOB_TYPE,
  BOOKING_REMINDER_JOB_TYPE,
  DEFAULT_JOB_MAX_ATTEMPTS,
  MEDIA_CLEANUP_JOB_TYPE,
  MEDIA_PURGE_JOB_TYPE,
  MRR_SNAPSHOT_DAILY_JOB_TYPE,
  PLAN_EDITED_NOTIFY_JOB_TYPE,
  SLOT_FREED_JOB_TYPE,
  TELEGRAM_SEND_JOB_TYPE,
  VISUAL_SEARCH_INDEX_JOB_TYPE,
  VK_SEND_JOB_TYPE,
  YOOKASSA_WEBHOOK_JOB_TYPE,
  createMediaCleanupJob,
  normalizeJobMeta,
} from "@/lib/queue/types";
import { runHotSlotExpiringJob } from "@/lib/hot-slots/job";
import { runSmartPriceJob } from "@/lib/hot-slots/smart-price-job";
import { runBookingReviewPromptJob } from "@/lib/bookings/review-prompts";
import { finalizePastBookings } from "@/lib/bookings/finalize-past";
import { expirePendingBookings } from "@/lib/bookings/expire-pending";
import {
  indexMediaAsset,
  isVisualSearchMissingAssetError,
  isVisualSearchRetryableError,
} from "@/lib/visual-search/indexer";
import { ensureVisualSearchStartupConfig, getVisualSearchConfig } from "@/lib/visual-search/config";
import { requeueAfterPipelineChangeOnce } from "@/lib/visual-search/reindex";
import { processYookassaWebhookPayload } from "@/lib/payments/yookassa/webhook-processor";
import { runMediaCleanup } from "@/lib/media/cleanup";
import { runMediaPurge } from "@/lib/media/purge";
import { processSlotFreed } from "@/lib/hot-slots/slot-freed";
import { runWeeklyStatsJob } from "@/lib/master/weekly-stats-job";
import { createMrrSnapshotForToday, runMrrSnapshotBackstop } from "@/lib/billing/mrr-snapshot";
import { processPlanEditedMassNotification } from "@/lib/notifications/admin-initiated";
import {
  recomputeAvailableToday,
  recomputeAvailableTodayForProvider,
} from "@/lib/schedule/recompute-available-today";

ensureVisualSearchStartupConfig();

// OBSERVABILITY-GLITCHTIP-01: initialise error tracking BEFORE the fatal
// handlers below are registered, so a crash during startup is still reported.
// No-op without `GLITCHTIP_DSN`; never throws (see `observability/server.ts`).
//
// The worker is the highest-value target for this: when a reminder, a webhook
// or an availableToday sweep fails here, nobody sees it. There is no user
// staring at a broken page — the failure is silent by construction.
initServerObservability("worker");

/**
 * Report a worker-side failure that would otherwise only exist as a log line.
 * Deliberately explicit rather than hooked into `logError`: `logError` also
 * carries expected outcomes (retries, dead-letter bookkeeping, healthcheck
 * ping misses) and already fans out to the ops Telegram channel — reporting all
 * of it would bury the failures that matter.
 */
function reportWorkerFailure(scope: string, error: unknown, extra: Record<string, unknown> = {}): void {
  reportError(error, { level: "error", tags: { worker_scope: scope }, extra });
}

/** Drain queued events, then exit. Always exits — `flushReports` never hangs. */
function flushAndExit(code: number): void {
  void flushReports(2000).finally(() => process.exit(code));
}

let isShuttingDown = false;
let jobsProcessed = 0;

// RES-24-соседний: пинг живости стоит В ГЛАВНОМ ЦИКЛЕ, до `dequeue()`, и раньше
// уходил в `fetch` без границы — то есть зависший `app` останавливал разбор
// очереди целиком, при том что собственные зависимости воркера (Redis,
// Postgres) в порядке.
//
// FIX-B13: механика (интервал, граница, проглатывание отказа) вынесена в
// `lib/queue/healthcheck-ping.ts` с инжектируемым `fetchImpl`. Причина — не
// стиль: этот файл вызывает `startWorker()` на импорте, поэтому в vitest не
// поднимается, и сторож дедлайна мог проверять только ТЕКСТ файла. Цена
// регрессии здесь невидима на глаз — «всё зелено», просто очередь стоит.
const healthcheckPinger = createHealthcheckPinger();
const STUCK_RECOVERY_INTERVAL_MS = 2 * 60 * 1000;
// FIX-15: refresh the in-flight job's lease well within PROCESSING_TIMEOUT_MS
// (5 min) so a live long-running job is never re-queued as "stuck".
const JOB_HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * FIX-15: keep the currently-processing job's lease fresh while it runs, so
 * `recoverStuckJobs` only re-queues genuinely dead work. Returns a stopper the
 * job loop calls (in `finally`) once processing/ack completes.
 */
function startJobHeartbeat(jobId: string): () => void {
  const timer = setInterval(() => {
    void heartbeatJob(jobId);
  }, JOB_HEARTBEAT_INTERVAL_MS);
  return () => clearInterval(timer);
}
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
  reportWorkerFailure("uncaughtException", error, { fatal: true });
  // Flush before exiting: the error we most want is exactly the one the
  // process is dying on. Bounded at 2s, then exit regardless.
  flushAndExit(1);
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
  reportWorkerFailure("unhandledRejection", reason, { fatal: true });
  flushAndExit(1);
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
  // CATALOG-AVAILABLE-TODAY Phase 3: recompute `Provider.availableToday` for
  // published providers. Fire-and-guard — a sweep error logs but NEVER crashes
  // the worker or blocks other jobs (same isolation as the jobs below). Runs
  // once at startup (fresh values immediately post-deploy, not all-`false`
  // until the first tick) + every 30 min. The sweep is engine-safe (a pure
  // read + a column write; slot-gen untouched).
  const runAvailableTodaySweep = () => {
    void recomputeAvailableToday()
      .then((summary) => {
        logInfo("availableToday.recompute.done", summary);
      })
      .catch((error) => {
        logError("availableToday.recompute.failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        reportWorkerFailure("availableToday.recompute", error);
      });
  };
  // Startup run — non-blocking (fire-and-forget; never delays worker boot).
  runAvailableTodaySweep();

  // BOOKING-FINALIZE-01: подтверждённые визиты после окончания → `FINISHED` в БД
  // (раньше статус только вычислялся, и всё, что фильтрует по нему, видело
  // ноль). Батч 200; за тик — до 10 батчей, чтобы первый запуск на накопленной
  // истории не растягивался на сутки, но и не держал БД одним длинным проходом.
  const runFinalizePastBookings = async () => {
    let total = 0;
    for (let batch = 0; batch < 10; batch += 1) {
      const summary = await finalizePastBookings();
      total += summary.finished;
      if (summary.candidates < 200) break;
    }
    if (total > 0) logInfo("bookings.finalize.done", { finished: total });
  };
  const runFinalizeSafe = () => {
    void runFinalizePastBookings().catch((error) => {
      logError("Booking finalize job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("bookings.finalize", error);
    });
  };
  runFinalizeSafe();

  // PENDING-EXPIRY: неподтверждённые записи отменяются через 24 ч после
  // создания или к началу визита. При старте и каждые 5 минут (ниже, рядом со
  // свипом напоминаний): срок «к началу визита» опаздывать на полчаса не должен.
  const runPendingExpirySafe = () => {
    void expirePendingBookings()
      .then((summary) => {
        if (summary.expired > 0) logInfo("bookings.pendingExpiry.done", summary);
      })
      .catch((error) => {
        logError("Booking pending expiry job failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        reportWorkerFailure("bookings.pendingExpiry", error);
      });
  };
  runPendingExpirySafe();

  // VISUAL-SEARCH-UNRECOGNIZED-01: фото, которые прежний конвейер пометил
  // нераспознанными (описание обрывалось лимитом токенов), один раз на версию
  // конвейера уходят в индексацию заново. Метка в SystemConfig — повторный
  // старт воркера платных вызовов не повторяет.
  void requeueAfterPipelineChangeOnce()
    .then((summary) => {
      if (summary.ran) logInfo("visualSearch.pipelineReindex.done", summary);
    })
    .catch((error) => {
      logError("visualSearch.pipelineReindex.failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("visualSearch.pipelineReindex", error);
    });

  const intervalMs = 30 * 60 * 1000;
  setInterval(() => {
    void runHotSlotExpiringJob().catch((error) => {
      logError("Hot slot expiring job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("hotSlots.expiring", error);
    });
    runFinalizeSafe();
    void runBookingReviewPromptJob().catch((error) => {
      logError("Booking review prompt job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("bookings.reviewPrompts", error);
    });
    runAvailableTodaySweep();
  }, intervalMs);

  // RES-14: напоминание жило ТОЛЬКО как задача в очереди — потеря очереди
  // (ручной FLUSHALL, пересоздание тома, окно `appendfsync everysec`) означала
  // его безвозвратную пропажу, хотя строка `Booking` позволяет его переродить.
  // Свип — детектор опоздания, а не перепланировка: на здоровой системе
  // кандидатов ноль, поэтому дубликатов задач он не создаёт. Каждые 5 минут —
  // запрос дешёвый (индекс `[status, startAtUtc]`, батч 200), а чем позже
  // обнаружено опоздание, тем меньше пользы от самого напоминания.
  const reminderReconcileIntervalMs = 5 * 60 * 1000;
  setInterval(() => {
    runPendingExpirySafe();
    void reconcileBookingReminders()
      .then((summary) => {
        if (summary.candidates > 0) {
          logInfo("bookings.reminders.reconciled", summary);
        }
      })
      .catch((error) => {
        logError("Booking reminder reconcile failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        reportWorkerFailure("bookings.reminders.reconcile", error);
      });
  }, reminderReconcileIntervalMs);

  // RES-26: снимок MRR держался на ОДНОМ внешнем срабатывании cron'а в сутки, и
  // пропуск оставлял в ряду дыру навсегда. Подбор — не бэкфилл, а второй шанс
  // ИЗМЕРИТЬ сегодняшний день (почему прошедшие дни восстановить нельзя — в
  // `runMrrSnapshotBackstop`). Каждые 15 минут, потому что решение принимает сам
  // хелпер по часу UTC: до окна это ранний выход без обращения к БД, внутри окна
  // — один `findUnique` по уникальному ключу, а несколько попыток подряд
  // страхуют от рестарта воркера на границе суток.
  const mrrBackstopIntervalMs = 15 * 60 * 1000;
  setInterval(() => {
    void runMrrSnapshotBackstop()
      .then((result) => {
        if (result.ran && result.created) {
          logInfo("billing.mrr.snapshot.backstopped", {
            snapshotDate: result.snapshot.snapshotDate.toISOString().slice(0, 10),
            mrrKopeks: result.snapshot.mrrKopeks.toString(),
          });
        }
      })
      .catch((error) => {
        logError("MRR snapshot backstop failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        reportWorkerFailure("billing.mrr.snapshot.backstop", error);
      });
  }, mrrBackstopIntervalMs);

  const mediaCleanupIntervalMs = 60 * 60 * 1000;
  setInterval(() => {
    void enqueue(createMediaCleanupJob()).catch((error) => {
      logError("Failed to enqueue media cleanup job", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("media.cleanup.enqueue", error);
    });
  }, mediaCleanupIntervalMs);

  // Weekly stats: check every hour, fires only on Monday UTC
  setInterval(() => {
    void runWeeklyStatsJob().catch((error) => {
      logError("Weekly stats job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("master.weeklyStats", error);
    });
  }, 60 * 60 * 1000);

  // Smart price: auto-create HotSlots from free slots per DiscountRule
  setInterval(() => {
    void runSmartPriceJob().catch((error) => {
      logError("Smart price job failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      reportWorkerFailure("hotSlots.smartPrice", error);
    });
  }, 60 * 60 * 1000);
}

function getRetryDelaySeconds(attempts: number): number {
  return Math.min(60, 2 ** attempts);
}

async function enqueueRetry(job: Job, delayMs: number): Promise<void> {
  const retryJob = { ...job };
  delete retryJob._processingStartedAt;
  await enqueue(normalizeJobMeta(retryJob), { delayMs });
}

async function ensureWorkerRedisReady(): Promise<void> {
  if (!isProduction) return;

  const redis = await getRedisConnection();
  if (!redis) {
    throw new Error("Redis is required for worker in production");
  }

  // FIX-C4: проба готовности ограничена сверху. Пост-дедлайн — тот же throw,
  // что и при отсутствующем клиенте: в проде воркер без Redis работать не
  // может и обязан не стартовать. Меняется не решение, а то, что при молчащем
  // Redis процесс теперь падает с внятной ошибкой за секунды вместо того,
  // чтобы висеть в `startWorker` бесконечно — а висящий воркер выглядит в
  // оркестраторе «запускается», а не «сломан», и не рестартится.
  await withRedisCommandTimeout("worker:boot:ping", redis.ping());
}

async function maybePingHealthcheck(): Promise<void> {
  await healthcheckPinger.maybePing();
}

async function monitorQueueStatsIfNeeded(): Promise<void> {
  jobsProcessed += 1;
  if (jobsProcessed % QUEUE_STATS_CHECK_EVERY_JOBS !== 0) return;

  const stats = await getQueueStats();
  logInfo("Queue stats", { ...stats, jobsProcessed });

  if (stats.pending > QUEUE_PENDING_OVERLOAD_THRESHOLD) {
    void sendTelegramAlert(
      `\uD83D\uDEA8 \u041E\u0447\u0435\u0440\u0435\u0434\u044C \u043F\u0435\u0440\u0435\u0433\u0440\u0443\u0436\u0435\u043D\u0430: ${stats.pending} \u0437\u0430\u0434\u0430\u0447 \u043E\u0436\u0438\u0434\u0430\u044E\u0442`,
      "queue:pending:overloaded"
    );
  }
  if (stats.dead > QUEUE_DEAD_THRESHOLD) {
    void sendTelegramAlert(
      `\u26A0\uFE0F Dead letter queue: ${stats.dead} \u0437\u0430\u0434\u0430\u0447 \u043D\u0435 \u0443\u0434\u0430\u043B\u043E\u0441\u044C \u043E\u0431\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C`,
      "queue:dead:overloaded"
    );
  }
  if (stats.processing > QUEUE_PROCESSING_THRESHOLD) {
    void sendTelegramAlert(
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

async function moveToDeadQueue(job: Job, error?: unknown): Promise<void> {
  await enqueueDeadJob(normalizeJobMeta(job));
  alertDeadJobs(1);
  // OBSERVABILITY-GLITCHTIP-01: a job that exhausted its retries is a permanent
  // silent failure — an unsent reminder, an unprocessed YooKassa webhook, an
  // unindexed asset. This is the single chokepoint for all of them; the
  // per-attempt retries above stay unreported so the signal isn't diluted.
  reportWorkerFailure(
    "job.deadLetter",
    error ?? new Error(`Job ${job.type} moved to dead-letter queue after ${getJobAttempts(job)} attempts`),
    { jobId: job.id, jobType: job.type, attempts: getJobAttempts(job) }
  );
}

async function processTelegramSend(
  job: Extract<Job, { type: typeof TELEGRAM_SEND_JOB_TYPE }>
): Promise<void> {
  // FIX-TELEGRAM-KILLSWITCH: final safety gate. Drop any already-queued
  // telegram job when user-facing Telegram is disabled — no API call, no retry,
  // no dead-letter. (Enqueue paths are already gated; this catches in-flight
  // jobs queued before the flag flipped.)
  if (!(await getTelegramEnabled())) return;

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

    await moveToDeadQueue({ ...job, attempts }, error);
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

    await moveToDeadQueue({ ...job, attempts: nextAttempts }, error);
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

  try {
    await processYookassaWebhookPayload(job.payload);
    void recordSurfaceEvent({
      surface: "webhook",
      outcome: "success",
      operation: "yookassa-worker-processor",
    });
  } catch (error) {
    void recordSurfaceEvent({
      surface: "webhook",
      outcome: "failure",
      operation: "yookassa-worker-processor",
      code: error instanceof Error ? error.name || "PROCESS_FAILED" : "PROCESS_FAILED",
    });
    throw error;
  }
}

async function processSlotFreedJob(
  job: Extract<Job, { type: typeof SLOT_FREED_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  await processSlotFreed(job.payload);
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

/**
 * DELETION-02 — удаление медиа из хранилища при удалении аккаунта/кабинета.
 *
 * Намеренно НЕ глотает ошибку: `runMediaPurge` бросает, если хоть один объект
 * не удалился, и это поднимает штатные ретраи очереди (до 3 попыток → dead
 * letter). Недоудалённая ПДн обязана быть заметной — в отличие от
 * `media.cleanup`, где речь о мусорных PENDING-загрузках и best-effort уместен.
 */
async function processMediaPurgeJob(
  job: Extract<Job, { type: typeof MEDIA_PURGE_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  await runMediaPurge(job.payload);
}

async function processMrrSnapshotDailyJob(
  job: Extract<Job, { type: typeof MRR_SNAPSHOT_DAILY_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  const result = await createMrrSnapshotForToday();
  logInfo("worker.mrr.snapshot.processed", {
    created: result.created,
    snapshotDate: result.snapshot.snapshotDate.toISOString().slice(0, 10),
    mrrKopeks: result.snapshot.mrrKopeks.toString(),
    activeCount: result.snapshot.activeSubscriptionsCount,
  });
}

async function processAvailableTodayRecomputeJob(
  job: Extract<Job, { type: typeof AVAILABLE_TODAY_RECOMPUTE_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  // CATALOG-AVAILABLE-TODAY Phase 4: targeted recompute for the mutated provider
  // (+ studio fan-out). Reuses the Phase-1 pure read path — no slot-gen touched.
  const summary = await recomputeAvailableTodayForProvider(job.payload.providerId);
  logInfo("worker.availableToday.recompute-provider.processed", {
    providerId: job.payload.providerId,
    total: summary.total,
    changed: summary.changed,
    errored: summary.errored,
  });
}

async function processPlanEditedNotifyJob(
  job: Extract<Job, { type: typeof PLAN_EDITED_NOTIFY_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  const result = await processPlanEditedMassNotification(job.payload);
  logInfo("worker.notification.plan-edited.mass.processed", {
    planId: job.payload.planId,
    planCode: job.payload.planCode,
    recipients: result.recipients,
    failures: result.failures,
  });
}

/**
 * VK-COMMUNITY-NOTIFY-01: личное сообщение от сообщества ВКонтакте. Повтор —
 * только на сбой сети и лимиты VK (`retry`); отказ по получателю или по ключу
 * повтором не лечится и закрывает задачу сразу (`skipped`).
 */
async function processVkSend(
  job: Extract<Job, { type: typeof VK_SEND_JOB_TYPE }>
): Promise<void> {
  const scheduleAt = getJobScheduleAt(job);
  if (typeof scheduleAt === "number" && scheduleAt > Date.now()) {
    await enqueueRetry(job, scheduleAt - Date.now());
    return;
  }

  const outcome = await processVkSendPayload(job.payload);
  if (outcome !== "retry") return;

  const nextAttempts = getJobAttempts(job) + 1;
  if (nextAttempts < getJobMaxAttempts(job)) {
    await enqueueRetry({ ...job, attempts: nextAttempts }, getRetryDelaySeconds(nextAttempts) * 1000);
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

async function processJob(job: Job): Promise<void> {
  try {
    if (job.type === TELEGRAM_SEND_JOB_TYPE) {
      await processTelegramSend(job);
    } else if (job.type === VK_SEND_JOB_TYPE) {
      await processVkSend(job);
    } else if (job.type === BOOKING_REMINDER_JOB_TYPE) {
      await processBookingReminderJob(job);
    } else if (job.type === VISUAL_SEARCH_INDEX_JOB_TYPE) {
      await processVisualSearchIndexJob(job);
    } else if (job.type === SLOT_FREED_JOB_TYPE) {
      await processSlotFreedJob(job);
    } else if (job.type === YOOKASSA_WEBHOOK_JOB_TYPE) {
      await processYookassaWebhookJob(job);
    } else if (job.type === MEDIA_CLEANUP_JOB_TYPE) {
      await processMediaCleanupJob(job);
    } else if (job.type === MEDIA_PURGE_JOB_TYPE) {
      await processMediaPurgeJob(job);
    } else if (job.type === MRR_SNAPSHOT_DAILY_JOB_TYPE) {
      await processMrrSnapshotDailyJob(job);
    } else if (job.type === AVAILABLE_TODAY_RECOMPUTE_JOB_TYPE) {
      await processAvailableTodayRecomputeJob(job);
    } else if (job.type === PLAN_EDITED_NOTIFY_JOB_TYPE) {
      await processPlanEditedNotifyJob(job);
    } else {
      const unknownJob = job as unknown as { id?: string; type?: string };
      logError("Worker received unknown job type", {
        jobId: unknownJob.id ?? "unknown",
        type: unknownJob.type ?? "unknown",
        __skipAlert: true,
      });
    }
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
      await moveToDeadQueue({ ...job, attempts }, error);
    }
  }

  await acknowledge(job);
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
        reportWorkerFailure("queue.recoverStuckJobs", error);
      });
  }, STUCK_RECOVERY_INTERVAL_MS);

  while (!isShuttingDown) {
    await maybePingHealthcheck();

    const job = await dequeue();
    if (!job) {
      await sleep(1000);
      continue;
    }

    // FIX-15: renew the job's lease while it runs so a live long-running job is
    // never re-queued by recoverStuckJobs. `processJob` acks on completion.
    const stopHeartbeat = startJobHeartbeat(job.id);
    try {
      await processJob(job);
    } finally {
      stopHeartbeat();
    }
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
    void sendTelegramAlert(
      `\u26A0\uFE0F \u0412\u043E\u0440\u043A\u0435\u0440 \u043F\u0435\u0440\u0435\u0437\u0430\u043F\u0443\u0449\u0435\u043D, \u0432\u043E\u0441\u0441\u0442\u0430\u043D\u043E\u0432\u043B\u0435\u043D\u043E ${recovered} \u0437\u0430\u0432\u0438\u0441\u0448\u0438\u0445 \u0437\u0430\u0434\u0430\u0447`,
      "worker:recovered-stuck-jobs"
    );
  }

  logInfo("Worker started");
  await runLoop();
  // Graceful SIGTERM/SIGINT path: drain queued events before the process goes
  // away, otherwise a shutdown swallows whatever was captured last.
  await flushReports(2000);
  process.exit(0);
}

startWorker().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  logError("Worker stopped", { error: message });
  reportWorkerFailure("startup", error, { fatal: true });
  flushAndExit(1);
});
