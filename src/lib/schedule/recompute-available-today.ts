import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";
import { hasFreeSlotToday, providerHasFreeSlotToday } from "@/lib/schedule/available-today";

/**
 * CATALOG-AVAILABLE-TODAY — Phase 2: the recompute sweep.
 *
 * Recomputes `Provider.availableToday` for EVERY published provider (the
 * catalog set) via the Phase-1 pure helper, and persists ONLY the diffs.
 *
 * 🔴 SERVER-ONLY (rule 13): Prisma + ScheduleEngine (transitively). Not
 * client-importable.
 *
 * 🔴 ENGINE-SAFETY — a consumer + a column write, NOT an engine change. It
 * loops the Phase-1 helper (`getDayPlanFromContext` + pure `buildSlotsForDay`,
 * no slots-cache write) and writes ONLY `availableToday`. Slot generation is
 * untouched (SHA byte-identical).
 *
 * Guardrails:
 *  - **Minimal-write:** compute → compare to the stored value → batch
 *    `updateMany` the flips only (never `false→false` for 43 rows every sweep).
 *  - **Resilient:** each provider's probe is try/caught → on throw, `logError`
 *    + CONTINUE. A broken provider keeps its PREVIOUS value (not flipped to
 *    false — that would hide real availability) and never aborts the sweep.
 *  - **Observable:** returns `{ total, changed, errored, erroredIds }`.
 *
 * Not scheduled yet — Phase 3 adds the worker `setInterval`. This runs
 * on-demand (the token-gated trigger endpoint + the verify script).
 */

export type RecomputeAvailableTodaySummary = {
  total: number;
  changed: number;
  errored: number;
  erroredIds: string[];
};

export async function recomputeAvailableToday(
  now: Date = new Date(),
): Promise<RecomputeAvailableTodaySummary> {
  const providers = await prisma.provider.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      type: true,
      availableToday: true,
      // Probe fields (AvailabilityProbeProvider) — so MASTER rows probe
      // without a re-query; studios re-resolve their masters in the helper.
      timezone: true,
      slotStepMin: true,
      minBookingHoursAhead: true,
      bufferBetweenBookingsMin: true,
    },
  });

  const flipToTrue: string[] = [];
  const flipToFalse: string[] = [];
  const erroredIds: string[] = [];

  for (const provider of providers) {
    let free: boolean;
    try {
      free =
        provider.type === ProviderType.MASTER
          ? await providerHasFreeSlotToday(provider, now)
          : // STUDIO → OR over its ACTIVE masters (re-resolved in the helper).
            await hasFreeSlotToday(provider.id, now);
    } catch (error) {
      erroredIds.push(provider.id);
      logError("availableToday.recompute.provider-failed", {
        providerId: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
      continue; // keep the previous stored value
    }

    if (free === provider.availableToday) continue; // no-op — minimal write
    (free ? flipToTrue : flipToFalse).push(provider.id);
  }

  if (flipToTrue.length > 0) {
    await prisma.provider.updateMany({
      where: { id: { in: flipToTrue } },
      data: { availableToday: true },
    });
  }
  if (flipToFalse.length > 0) {
    await prisma.provider.updateMany({
      where: { id: { in: flipToFalse } },
      data: { availableToday: false },
    });
  }

  return {
    total: providers.length,
    changed: flipToTrue.length + flipToFalse.length,
    errored: erroredIds.length,
    erroredIds,
  };
}
