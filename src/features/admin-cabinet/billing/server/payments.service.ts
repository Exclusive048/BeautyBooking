import "server-only";

import {
  BillingPaymentStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { paymentMethodFromMetadata } from "@/features/admin-cabinet/billing/lib/payment-method-display";
import type { AdminPaymentRow } from "@/features/admin-cabinet/billing/types";

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_LIMIT = 100;

type ListOpts = {
  /** Optional cursor for the history page (PENDING is always
   * returned in full — typically a handful of rows). */
  historyCursor?: string | null;
  historyLimit?: number;
};

function resolveDisplayName(user: {
  displayName: string | null;
  email: string | null;
  phone: string | null;
} | null | undefined): string {
  if (!user) return "—";
  return (
    user.displayName?.trim() ||
    user.email?.trim() ||
    user.phone?.trim() ||
    "—"
  );
}

function shortId(id: string): string {
  return `PAY-${id.slice(-8).toUpperCase()}`;
}

function toRow(
  payment: {
    id: string;
    status: BillingPaymentStatus;
    amountKopeks: number;
    yookassaPaymentId: string | null;
    createdAt: Date;
    subscriptionId: string;
    metadata: Prisma.JsonValue | null;
    subscription: {
      user: {
        id: string;
        displayName: string | null;
        email: string | null;
        phone: string | null;
      };
    };
  },
): AdminPaymentRow {
  return {
    id: payment.id,
    displayId: shortId(payment.id),
    user: {
      id: payment.subscription.user.id,
      displayName: resolveDisplayName(payment.subscription.user),
    },
    amountKopeks: payment.amountKopeks,
    status: payment.status,
    createdAt: payment.createdAt.toISOString(),
    paymentMethodDisplay: paymentMethodFromMetadata(payment.metadata),
    subscriptionId: payment.subscriptionId,
    yookassaPaymentId: payment.yookassaPaymentId,
    isRefundable:
      payment.status === BillingPaymentStatus.SUCCEEDED &&
      payment.yookassaPaymentId !== null,
  };
}

const SELECT = {
  id: true,
  status: true,
  amountKopeks: true,
  yookassaPaymentId: true,
  createdAt: true,
  subscriptionId: true,
  metadata: true,
  subscription: {
    select: {
      user: {
        select: {
          id: true,
          displayName: true,
          email: true,
          phone: true,
        },
      },
    },
  },
} satisfies Prisma.BillingPaymentSelect;

/**
 * Returns pending and history payments for the admin Payments tab.
 *
 * The reference UI groups payments into two sections — pending (need
 * admin attention, render with warning styling) and history (the rest,
 * paginated). Pending is always returned in full because there are
 * typically <20 such rows.
 */
export async function listAdminPayments(opts: ListOpts = {}): Promise<{
  pending: AdminPaymentRow[];
  history: AdminPaymentRow[];
  nextHistoryCursor: string | null;
}> {
  const historyLimit = Math.min(
    Math.max(opts.historyLimit ?? DEFAULT_HISTORY_LIMIT, 1),
    MAX_LIMIT,
  );

  const [pendingRows, historyRowsPlusOne] = await Promise.all([
    prisma.billingPayment.findMany({
      where: { status: BillingPaymentStatus.PENDING },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 50,
      select: SELECT,
    }),
    prisma.billingPayment.findMany({
      where: { status: { not: BillingPaymentStatus.PENDING } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: historyLimit + 1,
      ...(opts.historyCursor
        ? { cursor: { id: opts.historyCursor }, skip: 1 }
        : {}),
      select: SELECT,
    }),
  ]);

  const hasMore = historyRowsPlusOne.length > historyLimit;
  const historyPage = hasMore
    ? historyRowsPlusOne.slice(0, historyLimit)
    : historyRowsPlusOne;
  const nextHistoryCursor = hasMore
    ? (historyPage[historyPage.length - 1]?.id ?? null)
    : null;

  return {
    pending: pendingRows.map(toRow),
    history: historyPage.map(toRow),
    nextHistoryCursor,
  };
}
