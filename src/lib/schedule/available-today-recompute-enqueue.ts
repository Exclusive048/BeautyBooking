import { logError } from "@/lib/logging/logger";
import { enqueue } from "@/lib/queue/queue";
import { createAvailableTodayRecomputeJob } from "@/lib/queue/types";

/**
 * CATALOG-AVAILABLE-TODAY — Phase 4: the mark-dirty trigger.
 *
 * Enqueues a targeted `availableToday.recompute` job for one provider. Called
 * from the slot-cache invalidation hooks (`invalidateSlotsForBooking` /
 * `invalidateSlotsForMaster`) as an ADDITIONAL effect AFTER the existing
 * invalidation — never replacing or reordering it. The worker consumes the
 * job and runs `recomputeAvailableTodayForProvider` (pure read + minimal
 * write + studio fan-out).
 *
 * 🔴 Deliberately queue-only imports (queue + logger) — NO schedule /
 * availableToday imports — so `slotsCache.ts` can import this without a
 * `slotsCache → recompute → slots → slotsCache` cycle. Producer/consumer are
 * decoupled via the queue.
 *
 * 🔴 NEVER throws: a queue/Redis failure must not fail the booking/schedule
 * mutation path (the recompute is a freshness optimization, not a correctness
 * gate — the 30-min sweep reconciles anything the queue drops). Swallows +
 * logs. Cheap (one `rPush`); the recompute itself runs off-path in the worker.
 */
export async function enqueueAvailableTodayRecompute(providerId: string): Promise<void> {
  if (!providerId) return;
  try {
    await enqueue(createAvailableTodayRecomputeJob({ providerId }));
  } catch (error) {
    logError("availableToday.recompute.enqueue-failed", {
      providerId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
