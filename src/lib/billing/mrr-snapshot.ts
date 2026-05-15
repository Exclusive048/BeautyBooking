import { SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateMRR, type MrrInput } from "@/lib/billing/mrr";
import { logInfo } from "@/lib/logging/logger";

/**
 * Truncates a `Date` to UTC midnight. Postgres `@db.Date` columns store
 * just YYYY-MM-DD, so we feed them values normalised to midnight UTC —
 * this is the same convention `cancelledAtUtc` / `startedAtUtc` use
 * elsewhere in the schema.
 */
function utcDateOnly(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type SnapshotData = {
  snapshotDate: Date;
  mrrKopeks: bigint;
  activeSubscriptionsCount: number;
};

export type CreateSnapshotResult = {
  /** `false` when today's row already existed and we returned it
   * untouched — keeps the endpoint idempotent for retried cron runs. */
  created: boolean;
  snapshot: SnapshotData;
};

/**
 * Resolves each active subscription to a `{priceKopeks, periodMonths}`
 * tuple suitable for `calculateMRR`. The price is looked up via
 * `BillingPlanPrice` on the same `(planId, periodMonths)` tuple the
 * subscription was activated with — same lookup the renewal cron
 * uses, so MRR matches what would actually be billed.
 *
 * Subscriptions without a matching price row contribute 0 — defensive
 * against orphan rows that pre-date a price config change.
 */
async function loadActiveSubscriptionMrrInputs(): Promise<MrrInput[]> {
  const subs = await prisma.userSubscription.findMany({
    where: { status: SubscriptionStatus.ACTIVE },
    select: {
      planId: true,
      periodMonths: true,
      plan: {
        select: {
          prices: {
            select: { periodMonths: true, priceKopeks: true, isActive: true },
          },
        },
      },
    },
  });

  return subs.map((sub) => {
    const match = sub.plan.prices.find(
      (p) => p.periodMonths === sub.periodMonths,
    );
    return {
      priceKopeks: match?.priceKopeks ?? 0,
      periodMonths: sub.periodMonths,
    };
  });
}

/**
 * Writes today's MRR snapshot. Idempotent — `snapshotDate` is `@unique`
 * so a second run on the same UTC day returns the existing row instead
 * of erroring or duplicating.
 *
 * Race-safe: if two cron firings happen concurrently, the second hits
 * the unique-violation path and falls back to read the winner's row.
 */
export async function createMrrSnapshotForToday(): Promise<CreateSnapshotResult> {
  const today = utcDateOnly(new Date());

  const existing = await prisma.mrrSnapshot.findUnique({
    where: { snapshotDate: today },
    select: {
      snapshotDate: true,
      mrrKopeks: true,
      activeSubscriptionsCount: true,
    },
  });
  if (existing) {
    return { created: false, snapshot: existing };
  }

  const mrrInputs = await loadActiveSubscriptionMrrInputs();
  const mrrNumber = calculateMRR(mrrInputs);
  const mrrKopeks = BigInt(mrrNumber);
  const activeCount = mrrInputs.length;

  try {
    const created = await prisma.mrrSnapshot.create({
      data: {
        snapshotDate: today,
        mrrKopeks,
        activeSubscriptionsCount: activeCount,
      },
      select: {
        snapshotDate: true,
        mrrKopeks: true,
        activeSubscriptionsCount: true,
      },
    });

    logInfo("mrr.snapshot.created", {
      date: today.toISOString().slice(0, 10),
      mrrKopeks: mrrKopeks.toString(),
      activeCount,
    });

    return { created: true, snapshot: created };
  } catch (error) {
    // P2002 unique-violation = lost the race with another concurrent
    // cron run. Re-read and treat as `created: false`.
    const fallback = await prisma.mrrSnapshot.findUnique({
      where: { snapshotDate: today },
      select: {
        snapshotDate: true,
        mrrKopeks: true,
        activeSubscriptionsCount: true,
      },
    });
    if (fallback) {
      return { created: false, snapshot: fallback };
    }
    throw error;
  }
}

/**
 * Fetches the snapshot row for the day that was exactly `daysAgo`
 * before today (UTC). Returns `null` when no row exists for that
 * date — the KPI delta then falls back to "—" in the UI.
 *
 * No nearest-neighbour fallback by design: a missing snapshot is a
 * cron-health signal that should surface as `null`, not be silently
 * smoothed away by reading a different day.
 */
export async function getMrrSnapshotDaysAgo(
  daysAgo: number,
): Promise<Pick<SnapshotData, "mrrKopeks" | "activeSubscriptionsCount"> | null> {
  const target = utcDateOnly(new Date());
  target.setUTCDate(target.getUTCDate() - daysAgo);

  const snapshot = await prisma.mrrSnapshot.findUnique({
    where: { snapshotDate: target },
    select: { mrrKopeks: true, activeSubscriptionsCount: true },
  });
  return snapshot;
}
