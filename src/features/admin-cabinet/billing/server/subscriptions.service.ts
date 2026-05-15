import "server-only";

import {
  BillingPaymentStatus,
  SubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentMethodFromMetadata } from "@/features/admin-cabinet/billing/lib/payment-method-display";
import type { AdminSubscriptionRow } from "@/features/admin-cabinet/billing/types";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type ListOpts = {
  cursor?: string | null;
  limit?: number;
  statuses?: SubscriptionStatus[];
};

function resolveDisplayName(user: {
  displayName: string | null;
  email: string | null;
  phone: string | null;
}): string {
  return (
    user.displayName?.trim() ||
    user.email?.trim() ||
    user.phone?.trim() ||
    "—"
  );
}

/**
 * Returns active and at-risk subscriptions for the admin table.
 *
 * Each row carries the price the subscription was bought at (resolved
 * via `BillingPlanPrice` for the row's `periodMonths`) plus the most
 * recent succeeded `BillingPayment` for the payment-method hint —
 * eagerly included so there's no N+1 over the page.
 */
export async function listAdminSubscriptions(
  opts: ListOpts = {},
): Promise<{ items: AdminSubscriptionRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const statuses = opts.statuses ?? [
    SubscriptionStatus.ACTIVE,
    SubscriptionStatus.PAST_DUE,
  ];

  const where: Prisma.UserSubscriptionWhereInput = {
    status: { in: statuses },
  };

  const rows = await prisma.userSubscription.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      periodMonths: true,
      autoRenew: true,
      isTrial: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
        },
      },
      plan: {
        select: {
          code: true,
          name: true,
          tier: true,
          scope: true,
          prices: {
            select: { periodMonths: true, priceKopeks: true },
          },
        },
      },
      payments: {
        where: { status: BillingPaymentStatus.SUCCEEDED },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { metadata: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  const items: AdminSubscriptionRow[] = page.map((row) => {
    const priceRow = row.plan.prices.find(
      (p) => p.periodMonths === row.periodMonths,
    );
    const lastPayment = row.payments[0];
    return {
      id: row.id,
      user: {
        id: row.user.id,
        displayName: resolveDisplayName(row.user),
      },
      plan: {
        code: row.plan.code,
        name: row.plan.name,
        tier: row.plan.tier,
        scope: row.plan.scope,
      },
      periodMonths: row.periodMonths,
      status: row.status,
      amountKopeks: priceRow?.priceKopeks ?? 0,
      currentPeriodStart: row.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: row.currentPeriodEnd?.toISOString() ?? null,
      autoRenew: row.autoRenew,
      isTrial: row.isTrial,
      paymentMethodDisplay: lastPayment
        ? paymentMethodFromMetadata(lastPayment.metadata)
        : null,
    };
  });

  return { items, nextCursor };
}
