import { BookingStatus } from "@prisma/client";
import { buildScopeWhere } from "@/features/analytics/domain/helpers";
import type { AnalyticsContext } from "@/features/analytics/domain/guards";
import { prisma } from "@/lib/prisma";

/**
 * Client-cohort funnel for the master analytics page (30b).
 *
 * The shared `getBookingsFunnel` helper in `features/analytics` computes
 * a *booking-status* funnel (created → confirmed → completed). That's a
 * different domain — it answers "what happened to bookings". This helper
 * answers "how do clients move through the journey": who booked in this
 * period, who actually showed up, who came back, and who became a regular.
 *
 * Each stage is a **subset of stage 1** — we always look at the cohort
 * of clients who booked in the requested period, then ask follow-on
 * questions about their lifetime FINISHED behaviour. So Stage 4 cannot
 * exceed Stage 1, and the funnel reads sequentially. "Регулярная" uses
 * the same `REGULAR_VISIT_COUNT = 5` threshold as the CRM classifier
 * (`src/lib/master/clients-classifier.ts`) — kept in sync so masters see
 * the same definition in both surfaces.
 */

export type FunnelStepId = "booked" | "finished" | "returned" | "regular";

export type FunnelStep = {
  id: FunnelStepId;
  count: number;
  /** % of stage 1. 100 for stage 1 itself, 0 when stage 1 is zero. */
  pctFromTotal: number;
  /** % conversion from previous stage. Null on stage 1 (no previous). */
  pctFromPrevious: number | null;
};

const RETURNED_THRESHOLD = 2;
const REGULAR_THRESHOLD = 5;

const STAGE1_EXCLUDED_STATUSES: BookingStatus[] = [BookingStatus.REJECTED];

export async function computeMasterFunnel(input: {
  context: AnalyticsContext;
  fromUtc: Date;
  toUtcExclusive: Date;
}): Promise<FunnelStep[]> {
  const { context, fromUtc, toUtcExclusive } = input;
  const scopeWhere = buildScopeWhere(context);

  // Stage 1 cohort — clients who created a booking in the period (any
  // outcome except outright REJECTED, which is a "never happened" state).
  const stage1Bookings = await prisma.booking.findMany({
    where: {
      AND: [
        scopeWhere,
        { createdAt: { gte: fromUtc, lt: toUtcExclusive } },
        { clientUserId: { not: null } },
        { status: { notIn: STAGE1_EXCLUDED_STATUSES } },
      ],
    },
    select: { clientUserId: true },
  });

  const cohortIds = new Set<string>();
  for (const row of stage1Bookings) {
    if (row.clientUserId) cohortIds.add(row.clientUserId);
  }

  const stage1Count = cohortIds.size;

  if (stage1Count === 0) {
    return [
      buildStep("booked", 0, 0, null),
      buildStep("finished", 0, 0, null),
      buildStep("returned", 0, 0, null),
      buildStep("regular", 0, 0, null),
    ];
  }

  // Lifetime FINISHED counts per cohort client. One groupBy across the
  // whole booking history (scoped to this master), filtered to
  // `clientUserId in cohortIds`. Cheap: cohort size is bounded by
  // stage1Count which is small in practice.
  const cohortIdArray = Array.from(cohortIds);
  const [finishedHistory, firstFinished] = await Promise.all([
    prisma.booking.groupBy({
      by: ["clientUserId"],
      where: {
        AND: [
          scopeWhere,
          { clientUserId: { in: cohortIdArray } },
          { status: BookingStatus.FINISHED },
        ],
      },
      _count: { _all: true },
    }),
    // First-ever FINISHED date per cohort client. Used to decide
    // "Пришли (1-й визит)": their first ever FINISHED falls in period.
    prisma.booking.groupBy({
      by: ["clientUserId"],
      where: {
        AND: [
          scopeWhere,
          { clientUserId: { in: cohortIdArray } },
          { status: BookingStatus.FINISHED },
        ],
      },
      _min: { startAtUtc: true },
    }),
  ]);

  const finishedLifetimeByClient = new Map<string, number>();
  for (const row of finishedHistory) {
    if (row.clientUserId) {
      finishedLifetimeByClient.set(row.clientUserId, row._count._all);
    }
  }

  const firstFinishedAtByClient = new Map<string, Date | null>();
  for (const row of firstFinished) {
    if (row.clientUserId) {
      firstFinishedAtByClient.set(row.clientUserId, row._min.startAtUtc ?? null);
    }
  }

  let stage2Count = 0;
  let stage3Count = 0;
  let stage4Count = 0;
  for (const clientId of cohortIds) {
    const lifetimeFinished = finishedLifetimeByClient.get(clientId) ?? 0;
    if (lifetimeFinished === 0) continue;
    const firstAt = firstFinishedAtByClient.get(clientId) ?? null;
    const firstWasInPeriod =
      firstAt !== null && firstAt >= fromUtc && firstAt < toUtcExclusive;
    if (firstWasInPeriod) stage2Count += 1;
    if (lifetimeFinished >= RETURNED_THRESHOLD) stage3Count += 1;
    if (lifetimeFinished >= REGULAR_THRESHOLD) stage4Count += 1;
  }

  return [
    buildStep("booked", stage1Count, 100, null),
    buildStep(
      "finished",
      stage2Count,
      pctOf(stage2Count, stage1Count),
      pctOf(stage2Count, stage1Count)
    ),
    buildStep(
      "returned",
      stage3Count,
      pctOf(stage3Count, stage1Count),
      pctOf(stage3Count, stage2Count)
    ),
    buildStep(
      "regular",
      stage4Count,
      pctOf(stage4Count, stage1Count),
      pctOf(stage4Count, stage3Count)
    ),
  ];
}

function buildStep(
  id: FunnelStepId,
  count: number,
  pctFromTotal: number,
  pctFromPrevious: number | null
): FunnelStep {
  return {
    id,
    count,
    pctFromTotal,
    pctFromPrevious,
  };
}

function pctOf(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}
