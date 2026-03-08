import { AccountType, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/logging/logger";

const FREE_PLAN_CODES: Record<SubscriptionScope, string> = {
  MASTER: "MASTER_FREE",
  STUDIO: "STUDIO_FREE",
};

export function resolveBillingScopesFromRoles(roles: AccountType[]): SubscriptionScope[] {
  const scopes: SubscriptionScope[] = [];
  if (roles.includes(AccountType.MASTER)) {
    scopes.push(SubscriptionScope.MASTER);
  }
  if (roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN)) {
    scopes.push(SubscriptionScope.STUDIO);
  }
  return scopes;
}

export async function ensureFreeSubscriptionsForRoles(userId: string, roles: AccountType[]): Promise<void> {
  const scopes = resolveBillingScopesFromRoles(roles);
  if (scopes.length === 0) return;
  await Promise.all(scopes.map((scope) => ensureFreeSubscription(userId, scope)));
}

export async function ensureFreeSubscription(userId: string, scope: SubscriptionScope): Promise<void> {
  const planCode = FREE_PLAN_CODES[scope];
  const plan = await prisma.billingPlan.findUnique({
    where: { code: planCode },
    select: { id: true, code: true },
  });

  if (!plan) {
    logError("Free billing plan not found", { userId, scope, planCode });
    return;
  }

  const existing = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId, scope } },
    select: { id: true, planId: true, status: true },
  });

  if (!existing) {
    const now = new Date();
    await prisma.userSubscription.create({
      data: {
        userId,
        scope,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths: 1,
        autoRenew: false,
        cancelAtPeriodEnd: false,
      },
      select: { id: true },
    });
    return;
  }

  if (existing.planId !== plan.id) {
    return;
  }

  if (existing.status === "ACTIVE") {
    return;
  }

  const now = new Date();
  await prisma.userSubscription.update({
    where: { id: existing.id },
    data: {
      status: "ACTIVE",
      currentPeriodStart: now,
      currentPeriodEnd: null,
      periodMonths: 1,
      autoRenew: false,
      cancelAtPeriodEnd: false,
      graceUntil: null,
      nextBillingAt: null,
    },
    select: { id: true },
  });
}
