import { fail, ok } from "@/lib/api/response";
import { env } from "@/lib/env";
import { logError } from "@/lib/logging/logger";
import { recomputeAvailableToday } from "@/lib/schedule/recompute-available-today";

export const runtime = "nodejs";

/**
 * CATALOG-AVAILABLE-TODAY — Phase 2: on-demand recompute trigger.
 *
 *   POST /api/catalog/available-today/run
 *   Header `x-cron-token: <AVAILABILITY_CRON_TOKEN>` (or `?token=…`)
 *
 * Recomputes `Provider.availableToday` for all published providers (via the
 * engine-safe Phase-1 helper) and returns the sweep summary. Runs the sweep
 * INLINE — cheap at catalog scale (~43 providers, pure probes). Phase 3 adds
 * a ~30-min in-worker `setInterval`; this endpoint stays as the manual /
 * external-cron trigger.
 *
 * 🔴 Fail-closed (rule 12 — internal cron surface, not public): missing OR
 * invalid token → 403; if `AVAILABILITY_CRON_TOKEN` is unset the endpoint
 * refuses (never runs unauthenticated). Same shape as
 * `/api/billing/mrr/snapshot/run`.
 */
function getCronToken(req: Request): string | null {
  const header = req.headers.get("x-cron-token");
  if (header?.trim()) return header.trim();
  const token = new URL(req.url).searchParams.get("token");
  return token?.trim() ?? null;
}

export async function POST(req: Request) {
  const expected = env.AVAILABILITY_CRON_TOKEN?.trim();
  const token = getCronToken(req);
  if (!expected || token !== expected) {
    return fail("Доступ запрещён.", 403, "FORBIDDEN");
  }

  try {
    const summary = await recomputeAvailableToday();
    return ok(summary);
  } catch (error) {
    logError("catalog.available-today.run failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return fail("Не удалось пересчитать доступность.", 500, "AVAILABILITY_RECOMPUTE_FAILED");
  }
}
