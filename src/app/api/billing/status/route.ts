import { ok, fail } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import type { SubscriptionScope } from "@prisma/client";

export const runtime = "nodejs";

type SubscriptionSummary = {
  id: string;
  scope: SubscriptionScope;
  status: string;
  periodMonths: number;
  autoRenew: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  nextBillingAt: string | null;
  graceUntil: string | null;
  paymentMethodId: string | null;
  lastPaymentAt: string | null;
  plan: {
    id: string;
    code: string;
    name: string;
    tier: string;
    scope: SubscriptionScope;
  };
  pendingConfirmationUrl: string | null;
};

export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("РќРµРѕР±С…РѕРґРёРјР° Р°РІС‚РѕСЂРёР·Р°С†РёСЏ.", 401, "UNAUTHORIZED");

  const subscriptions = await prisma.userSubscription.findMany({
    where: { userId: user.id },
    select: {
      id: true,
      scope: true,
      status: true,
      periodMonths: true,
      autoRenew: true,
      cancelAtPeriodEnd: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      nextBillingAt: true,
      graceUntil: true,
      paymentMethodId: true,
      lastPaymentAt: true,
      plan: {
        select: { id: true, code: true, name: true, tier: true, scope: true },
      },
    },
  });

  const subscriptionIds = subscriptions.map((subscription) => subscription.id);
  const pendingPayments =
    subscriptionIds.length === 0
      ? []
      : await prisma.billingPayment.findMany({
          where: { subscriptionId: { in: subscriptionIds }, status: "PENDING" },
          select: { subscriptionId: true, confirmationUrl: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        });

  const pendingBySubscription = new Map<string, string>();
  for (const payment of pendingPayments) {
    if (!payment.confirmationUrl) continue;
    if (!pendingBySubscription.has(payment.subscriptionId)) {
      pendingBySubscription.set(payment.subscriptionId, payment.confirmationUrl);
    }
  }

  const grouped: Record<SubscriptionScope, SubscriptionSummary | null> = {
    MASTER: null,
    STUDIO: null,
  };

  for (const subscription of subscriptions) {
    grouped[subscription.scope] = {
      id: subscription.id,
      scope: subscription.scope,
      status: subscription.status,
      periodMonths: subscription.periodMonths,
      autoRenew: subscription.autoRenew,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
      nextBillingAt: subscription.nextBillingAt?.toISOString() ?? null,
      graceUntil: subscription.graceUntil?.toISOString() ?? null,
      paymentMethodId: subscription.paymentMethodId ?? null,
      lastPaymentAt: subscription.lastPaymentAt?.toISOString() ?? null,
      plan: subscription.plan,
      pendingConfirmationUrl: pendingBySubscription.get(subscription.id) ?? null,
    };
  }

  const availableScopesSet = new Set<SubscriptionScope>();
  if (user.roles.includes("MASTER")) {
    availableScopesSet.add("MASTER");
  }
  if (user.roles.includes("STUDIO") || user.roles.includes("STUDIO_ADMIN")) {
    availableScopesSet.add("STUDIO");
  }
  for (const subscription of subscriptions) {
    availableScopesSet.add(subscription.scope);
  }
  const availableScopes = Array.from(availableScopesSet);

  return ok({ subscriptions: grouped, availableScopes });
}
