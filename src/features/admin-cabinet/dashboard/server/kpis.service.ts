import "server-only";

import { BillingPaymentStatus, SubscriptionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  computeAbsoluteDelta,
  computePercentDelta,
  formatCount,
  formatRevenueShort,
  utcLastNDays,
  utcMonthRange,
} from "@/features/admin-cabinet/dashboard/server/shared";
import type {
  AdminKpi,
  AdminKpis,
} from "@/features/admin-cabinet/dashboard/types";

/**
 * KPI aggregations for the four headline tiles on `/admin`.
 *
 * Window choices match the reference design:
 *   1. Registrations — last 7 days vs previous 7 days (percentage delta)
 *   2. Bookings — last 24h vs previous 24h (percentage delta)
 *   3. Active subscriptions — point-in-time count vs same time last week
 *      (absolute delta: "+24" reads better than "+1.5%" for low absolute
 *      values)
 *   4. Revenue — current calendar month vs previous calendar month
 *      (percentage delta)
 */
export async function getAdminKpis(): Promise<AdminKpis> {
  const last7 = utcLastNDays(7);
  const prev7 = {
    start: new Date(last7.start.getTime() - 7 * 24 * 60 * 60 * 1000),
    end: last7.start,
  };

  const day1End = new Date();
  const day1Start = new Date(day1End.getTime() - 24 * 60 * 60 * 1000);
  const day1PrevStart = new Date(day1Start.getTime() - 24 * 60 * 60 * 1000);

  const last7End = last7.start; // used for "subs a week ago" snapshot

  const thisMonth = utcMonthRange(0);
  const prevMonth = utcMonthRange(1);

  const [
    reg7d,
    regPrev7d,
    bookings24h,
    bookingsPrev24h,
    activeSubs,
    activeSubsWeekAgo,
    revenueThisMonth,
    revenueLastMonth,
  ] = await Promise.all([
    prisma.userProfile.count({
      where: { createdAt: { gte: last7.start, lt: last7.end } },
    }),
    prisma.userProfile.count({
      where: { createdAt: { gte: prev7.start, lt: prev7.end } },
    }),
    prisma.booking.count({
      where: { createdAt: { gte: day1Start, lt: day1End } },
    }),
    prisma.booking.count({
      where: { createdAt: { gte: day1PrevStart, lt: day1Start } },
    }),
    // Current active subscription count. Excludes FREE plans (signal of
    // someone paying) — same heuristic as the legacy /api/admin/metrics.
    prisma.userSubscription.count({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: { code: { notIn: ["MASTER_FREE", "STUDIO_FREE"] } },
      },
    }),
    // "Active a week ago": ACTIVE row that already existed by that
    // cut-off. Approximated via `currentPeriodStart` since subscriptions
    // don't carry a separate "activated-at" timestamp.
    prisma.userSubscription.count({
      where: {
        status: SubscriptionStatus.ACTIVE,
        plan: { code: { notIn: ["MASTER_FREE", "STUDIO_FREE"] } },
        currentPeriodStart: { lt: last7End },
      },
    }),
    prisma.billingPayment.aggregate({
      _sum: { amountKopeks: true },
      where: {
        status: BillingPaymentStatus.SUCCEEDED,
        createdAt: { gte: thisMonth.start, lt: thisMonth.end },
      },
    }),
    prisma.billingPayment.aggregate({
      _sum: { amountKopeks: true },
      where: {
        status: BillingPaymentStatus.SUCCEEDED,
        createdAt: { gte: prevMonth.start, lt: prevMonth.end },
      },
    }),
  ]);

  const revenueNowKopeks = revenueThisMonth._sum.amountKopeks ?? 0;
  const revenuePrevKopeks = revenueLastMonth._sum.amountKopeks ?? 0;

  const reg7dDelta = computePercentDelta(reg7d, regPrev7d);
  const bookingsDelta = computePercentDelta(bookings24h, bookingsPrev24h);
  const subsDelta = computeAbsoluteDelta(activeSubs, activeSubsWeekAgo);
  const revenueDelta = computePercentDelta(
    revenueNowKopeks,
    revenuePrevKopeks,
  );

  const items: AdminKpi[] = [
    {
      key: "registrations7d",
      valueText: formatCount(reg7d),
      rawValue: reg7d,
      deltaText: reg7dDelta.text,
      deltaSign: reg7dDelta.sign,
    },
    {
      key: "bookings1d",
      valueText: formatCount(bookings24h),
      rawValue: bookings24h,
      deltaText: bookingsDelta.text,
      deltaSign: bookingsDelta.sign,
    },
    {
      key: "activeSubs",
      valueText: formatCount(activeSubs),
      rawValue: activeSubs,
      deltaText: subsDelta.text,
      deltaSign: subsDelta.sign,
    },
    {
      key: "revenueMonth",
      valueText: formatRevenueShort(revenueNowKopeks),
      rawValue: revenueNowKopeks,
      deltaText: revenueDelta.text,
      deltaSign: revenueDelta.sign,
    },
  ];

  return { items };
}
