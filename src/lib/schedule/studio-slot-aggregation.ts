import { prisma } from "@/lib/prisma";
import { ProviderType } from "@prisma/client";
import { listAvailabilitySlotsPaginated } from "@/lib/schedule/usecases";
import { resolveServiceDuration } from "@/lib/schedule/resolveDuration";
import { isDateKey } from "@/lib/schedule/dateKey";

/**
 * Studio-wide slot aggregation for «любой свободный мастер» UX.
 *
 * Builds on `listAvailabilitySlotsPaginated` per-master (the existing
 * schedule engine — DayPlan cache, breaks, exceptions, bookings, fixed
 * mode all already honoured). No engine rewrite. For each requested
 * day, runs per-master queries in parallel, then merges slots that
 * share the same start time into a single aggregated entry that
 * carries the list of masters who are free at that time.
 *
 * Used by the studio booking widget's "Любой мастер" scenario. The
 * widget already does this client-side; this server helper enables
 * SSR-rendered free-slot summaries on public studio pages and (later)
 * faster initial paint on the booking flow itself.
 */

export type AggregatedStudioSlot = {
  startAtUtc: string;
  endAtUtc: string;
  label: string;
  /** Provider IDs of masters free at this slot, ordered by master input order. */
  availableMasterIds: string[];
  /** First master who can take the slot — picked deterministically (input order). */
  earliestMasterId: string;
};

export type AggregateStudioSlotsResult =
  | { ok: true; slots: AggregatedStudioSlot[]; mastersConsidered: number }
  | { ok: false; code: string; message: string };

export type AggregateStudioSlotsInput = {
  studioProviderId: string;
  serviceId: string;
  /** Local date key YYYY-MM-DD (studio timezone — same as `/api/masters/{id}/availability`). */
  fromKey: string;
  /** Exclusive upper bound. Optional; defaults to fromKey + 1 day. */
  toKeyExclusive?: string;
  /** Max masters to query in parallel. Defaults to 12; safety cap on N×Prisma. */
  maxMasters?: number;
};

const DEFAULT_MAX_MASTERS = 12;

/**
 * Loads MasterService rows for a studio's service. Filters to ACTIVE
 * masters per invariant #24 — INVITED / DISABLED masters are excluded
 * from aggregation (they can't accept bookings anyway).
 */
async function loadEligibleMasterIds(input: {
  studioProviderId: string;
  serviceId: string;
  limit: number;
}): Promise<string[]> {
  const rows = await prisma.masterService.findMany({
    where: {
      serviceId: input.serviceId,
      isEnabled: true,
      masterProvider: {
        type: ProviderType.MASTER,
        studioId: input.studioProviderId,
        ownerUserId: { not: null },
        isPublished: true,
      },
    },
    select: { masterProviderId: true },
    take: input.limit,
    orderBy: { createdAt: "asc" },
  });
  return rows.map((row) => row.masterProviderId);
}

export async function aggregateStudioSlots(
  input: AggregateStudioSlotsInput
): Promise<AggregateStudioSlotsResult> {
  if (!isDateKey(input.fromKey)) {
    return { ok: false, code: "DATE_INVALID", message: "Invalid fromKey" };
  }
  if (input.toKeyExclusive && !isDateKey(input.toKeyExclusive)) {
    return { ok: false, code: "DATE_INVALID", message: "Invalid toKeyExclusive" };
  }

  const masterIds = await loadEligibleMasterIds({
    studioProviderId: input.studioProviderId,
    serviceId: input.serviceId,
    limit: input.maxMasters ?? DEFAULT_MAX_MASTERS,
  });

  if (masterIds.length === 0) {
    return { ok: true, slots: [], mastersConsidered: 0 };
  }

  // Each master may have a different effective duration (override). The
  // aggregator runs per-master with its own duration — schedules are
  // already per-master in the engine.
  const perMaster = await Promise.all(
    masterIds.map(async (masterId) => {
      const duration = await resolveServiceDuration(masterId, input.serviceId);
      if (!duration.ok) {
        return { masterId, slots: [] as Array<{ startAtUtc: string; endAtUtc: string; label: string }> };
      }
      const result = await listAvailabilitySlotsPaginated(masterId, input.serviceId, duration.data, {
        fromKey: input.fromKey,
        toKeyExclusive: input.toKeyExclusive,
        limit: 14,
      });
      if (!result.ok) {
        return { masterId, slots: [] };
      }
      const slots = result.data.slots.map((slot) => {
        const startAtUtc = slot.startAtUtc instanceof Date ? slot.startAtUtc.toISOString() : slot.startAtUtc;
        const endAtUtc = slot.endAtUtc instanceof Date ? slot.endAtUtc.toISOString() : slot.endAtUtc;
        return { startAtUtc, endAtUtc, label: slot.label };
      });
      return { masterId, slots };
    })
  );

  return {
    ok: true,
    mastersConsidered: masterIds.length,
    slots: mergeByStart(perMaster, masterIds),
  };
}

/**
 * Pure merge step — exported for unit tests. Groups per-master slots by
 * their start time; aggregated slot carries every master who is free at
 * that moment. `earliestMasterId` is the first master (by input order)
 * who is free at the slot — deterministic across runs.
 */
export function mergeByStart(
  perMaster: ReadonlyArray<{
    masterId: string;
    slots: ReadonlyArray<{ startAtUtc: string; endAtUtc: string; label: string }>;
  }>,
  masterOrder: ReadonlyArray<string>
): AggregatedStudioSlot[] {
  const orderIndex = new Map<string, number>();
  masterOrder.forEach((id, idx) => orderIndex.set(id, idx));

  type Bucket = {
    startAtUtc: string;
    endAtUtc: string;
    label: string;
    masters: Map<string, number>;
  };
  const byStart = new Map<string, Bucket>();

  for (const entry of perMaster) {
    const masterIdx = orderIndex.get(entry.masterId) ?? Number.MAX_SAFE_INTEGER;
    for (const slot of entry.slots) {
      const existing = byStart.get(slot.startAtUtc);
      if (existing) {
        if (!existing.masters.has(entry.masterId)) {
          existing.masters.set(entry.masterId, masterIdx);
        }
        continue;
      }
      const masters = new Map<string, number>();
      masters.set(entry.masterId, masterIdx);
      byStart.set(slot.startAtUtc, {
        startAtUtc: slot.startAtUtc,
        endAtUtc: slot.endAtUtc,
        label: slot.label,
        masters,
      });
    }
  }

  const aggregated: AggregatedStudioSlot[] = [];
  for (const bucket of byStart.values()) {
    const sortedMasterIds = Array.from(bucket.masters.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => id);
    aggregated.push({
      startAtUtc: bucket.startAtUtc,
      endAtUtc: bucket.endAtUtc,
      label: bucket.label,
      availableMasterIds: sortedMasterIds,
      earliestMasterId: sortedMasterIds[0]!,
    });
  }
  aggregated.sort((a, b) => a.startAtUtc.localeCompare(b.startAtUtc));
  return aggregated;
}
