import "server-only";

import {
  BillingPaymentStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateMRR } from "@/lib/billing/mrr";
import { getMrrSnapshotDaysAgo } from "@/lib/billing/mrr-snapshot";
import type { AdminBillingKpis } from "@/features/admin-cabinet/billing/types";

const MRR_DELTA_LOOKBACK_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Headline KPI numbers for `/admin/billing`.
 *
 * Source mapping:
 *   - MRR: sum across `UserSubscription` where `status=ACTIVE` of
 *     `priceKopeks / periodMonths`. Price resolved through the
 *     `BillingPlanPrice` row matching the subscription's period.
 *   - Active subs: count of ACTIVE rows; delta = subs started in
 *     the last 30 days (per `startedAt`).
 *   - Pending payments: count + total of `BillingPayment.status=PENDING`.
 *   - Failed 7d: count of FAILED in 7d window + percent of
 *     (FAILED + SUCCEEDED) in same window.
 *
 * MRR delta vs previous month: there's no historical snapshot table,
 * so we return `null` and the UI renders "—". Once daily MRR
 * snapshots land (see BACKLOG) we can compute the change here.
 */
export async function getAdminBillingKpis(): Promise<AdminBillingKpis> {
  const now = new Date();
  const last30Start = new Date(now.getTime() - 30 * DAY_MS);
  const last7Start = new Date(now.getTime() - 7 * DAY_MS);

  const [activeSubs, recentSubsCount, pendingAgg, failed7d, succeeded7d] =
    await Promise.all([
      // Active subscriptions plus the period price for the row's
      // configured `periodMonths`. We can't filter the price relation
      // by a column on the parent in a single query without raw SQL,
      // so we fetch all prices for those plans and pick in JS.
      prisma.userSubscription.findMany({
        where: { status: SubscriptionStatus.ACTIVE },
        select: {
          id: true,
          startedAt: true,
          periodMonths: true,
          plan: {
            select: {
              id: true,
              prices: {
                select: { periodMonths: true, priceKopeks: true, isActive: true },
              },
            },
          },
        },
      }),
      prisma.userSubscription.count({
        where: {
          status: SubscriptionStatus.ACTIVE,
          startedAt: { gte: last30Start },
        },
      }),
      prisma.billingPayment.aggregate({
        where: { status: BillingPaymentStatus.PENDING },
        _count: { _all: true },
        _sum: { amountKopeks: true },
      }),
      prisma.billingPayment.count({
        where: {
          status: BillingPaymentStatus.FAILED,
          createdAt: { gte: last7Start },
        },
      }),
      prisma.billingPayment.count({
        where: {
          status: BillingPaymentStatus.SUCCEEDED,
          createdAt: { gte: last7Start },
        },
      }),
    ]);

  // Resolve each subscription's actual price for its period. Fall
  // back to 0 if the plan row has no matching period entry (data
  // glitch — we don't crash KPI rendering for it).
  const mrrInputs = activeSubs.map((sub) => {
    const match = sub.plan.prices.find(
      (p) => p.periodMonths === sub.periodMonths,
    );
    return {
      priceKopeks: match?.priceKopeks ?? 0,
      periodMonths: sub.periodMonths,
    };
  });
  const mrrKopeks = calculateMRR(mrrInputs);

  const attempts = failed7d + succeeded7d;
  const failedPercent =
    attempts === 0 ? null : Math.round((failed7d / attempts) * 1000) / 10;

  // MRR delta vs ~30 days ago — driven by the `MrrSnapshot` row
  // written daily by the worker (see ADMIN-BILLING-A + MRR-SNAPSHOTS-A).
  // Returns `null` when no snapshot exists for that date, which is
  // expected for the first 30 days after the snapshot cron starts
  // running. The UI then renders «—» instead of a misleading delta.
  const previousSnapshot = await getMrrSnapshotDaysAgo(MRR_DELTA_LOOKBACK_DAYS);
  let mrrDeltaPercent: number | null = null;
  if (previousSnapshot && previousSnapshot.mrrKopeks > BigInt(0)) {
    const previousKopeks = previousSnapshot.mrrKopeks;
    const currentKopeks = BigInt(mrrKopeks);
    // BigInt subtraction first — cast to Number only for the division
    // (safe: deltas of even tens of millions of rubles stay well below
    // `Number.MAX_SAFE_INTEGER`).
    const diff = currentKopeks - previousKopeks;
    mrrDeltaPercent = Math.round(
      (Number(diff) / Number(previousKopeks)) * 100,
    );
  }

  return {
    mrr: {
      valueKopeks: mrrKopeks,
      deltaPercent: mrrDeltaPercent,
    },
    activeSubscriptions: {
      count: activeSubs.length,
      deltaCount: recentSubsCount,
    },
    pendingPayments: {
      count: pendingAgg._count._all,
      totalKopeks: pendingAgg._sum.amountKopeks ?? 0,
    },
    failedLast7Days: {
      count: failed7d,
      percentOfAttempts: failedPercent,
    },
  };
}
