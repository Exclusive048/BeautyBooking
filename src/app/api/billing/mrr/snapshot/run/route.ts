import { fail, ok } from "@/lib/api/response";
import { isAuthorizedCronRequest } from "@/lib/api/cron-auth";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import { enqueue } from "@/lib/queue/queue";
import { createMrrSnapshotDailyJob } from "@/lib/queue/types";

export const runtime = "nodejs";

/**
 * Cron trigger for the daily MRR snapshot job.
 *
 *   POST /api/billing/mrr/snapshot/run
 *   Header: `x-cron-token: <MRR_SNAPSHOT_SECRET>`
 *
 * Same auth shape as `/api/billing/renew/run` — token in either an
 * `x-cron-token` header (SEC-21: the `?token=…` query form is gone — a
 * query string lands in LB access logs and referrers), validated against the
 * env var. Endpoint **enqueues** the job rather than running it
 * inline so the cron invoker returns fast even when the worker is
 * busy; the worker handles the snapshot creation with retry/
 * dead-letter on failure (see `processMrrSnapshotDailyJob` in
 * `src/worker.ts`).
 *
 * The snapshot job itself is idempotent (`@unique snapshotDate`), so
 * a cron retry within the same UTC day reads back the existing row
 * rather than creating a duplicate.
 */

export async function POST(req: Request) {
  // SEC-21: только заголовок `x-cron-token`. Query-строка попадает в access-логи
  // балансировщика и в реферер — секрету там не место.
  if (!isAuthorizedCronRequest(req, env.MRR_SNAPSHOT_SECRET)) {
    return fail("Доступ запрещён.", 403, "FORBIDDEN");
  }

  try {
    const job = createMrrSnapshotDailyJob();
    await enqueue(job);
    return ok({ enqueued: true, jobId: job.id });
  } catch (error) {
    logError("billing.mrr.snapshot.run enqueue failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось запланировать снимок MRR", 500, "MRR_ENQUEUE_FAILED");
  }
}
