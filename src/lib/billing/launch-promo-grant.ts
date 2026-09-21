import { AccountType, SubscriptionStatus } from "@prisma/client";
import type { Prisma, PrismaClient, SubscriptionScope } from "@prisma/client";
import { LAUNCH_PROMO_ENDS_AT, isLaunchPromoActive } from "@/lib/billing/launch-promo";
import { catalogPlanCode } from "@/lib/billing/plan-catalog";
import { isSubscriptionActive } from "@/lib/billing/subscription-active";

/**
 * LAUNCH-PROMO-01 — выдача PREMIUM «до 1 ноября» ОДНОЙ функцией на двух путях:
 * регистрация кабинета (`activateTrialForNewProvider`) и бэкфилл уже
 * зарегистрированных кабинетов в сиде деплоя (`scripts/seed-billing-plans.ts`).
 *
 * Модуль намеренно не импортирует `@/lib/prisma` и ничего server-only: клиент
 * (или транзакция) приходит аргументом, поэтому сид исполняет его своим
 * `PrismaClient` в worker-образе (PWA-FIX-01).
 *
 * Строка подписки одна на (user, scope) — `@@unique([userId, scope])`, — поэтому
 * выдача мутирует существующую строку, а не создаёт рядом новую (как и trial).
 * Платящего подписчика выдача не трогает никогда.
 */

export type LaunchPromoOutcome =
  | "created"
  | "upgraded"
  | "skipped-promo-over"
  | "skipped-already"
  | "skipped-paid"
  | "skipped-no-plan";

export type LaunchPromoResult = {
  outcome: LaunchPromoOutcome;
  subscriptionId?: string;
  trialEndsAt?: Date;
};

/** Роли → скоупы подписки. Единственное определение (его же зовёт `ensure-free-subscription`). */
export function resolveBillingScopesFromRoles(roles: ReadonlyArray<AccountType>): SubscriptionScope[] {
  const scopes: SubscriptionScope[] = [];
  if (roles.includes(AccountType.MASTER)) scopes.push("MASTER");
  if (roles.includes(AccountType.STUDIO) || roles.includes(AccountType.STUDIO_ADMIN)) scopes.push("STUDIO");
  return scopes;
}

async function findPremiumPlan(tx: Prisma.TransactionClient, scope: SubscriptionScope) {
  const canonical = await tx.billingPlan.findUnique({
    where: { code: catalogPlanCode(scope, "PREMIUM") },
    select: { id: true, code: true, isActive: true },
  });
  if (canonical?.isActive) return canonical;
  return tx.billingPlan.findFirst({
    where: { scope, tier: "PREMIUM", isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, code: true, isActive: true },
  });
}

export async function grantLaunchPromoInTx(
  tx: Prisma.TransactionClient,
  input: { userId: string; scope: SubscriptionScope; now?: Date; source: string },
): Promise<LaunchPromoResult> {
  const now = input.now ?? new Date();
  if (!isLaunchPromoActive(now)) return { outcome: "skipped-promo-over" };

  const trialEndsAt = new Date(LAUNCH_PROMO_ENDS_AT.getTime());
  const { userId, scope } = input;

  const existing = await tx.userSubscription.findUnique({
    where: { userId_scope: { userId, scope } },
    select: {
      id: true,
      planId: true,
      status: true,
      isTrial: true,
      trialEndsAt: true,
      currentPeriodEnd: true,
      graceUntil: true,
      plan: { select: { tier: true } },
    },
  });

  if (existing) {
    // Платная живая подписка — не трогаем (акция не повод отменять оплаченное).
    const paid = !existing.isTrial && existing.plan.tier !== "FREE" && isSubscriptionActive(existing, now);
    if (paid) return { outcome: "skipped-paid", subscriptionId: existing.id };

    const alreadyPromo =
      existing.isTrial &&
      existing.plan.tier === "PREMIUM" &&
      existing.status === SubscriptionStatus.ACTIVE &&
      existing.trialEndsAt !== null &&
      existing.trialEndsAt.getTime() >= trialEndsAt.getTime();
    if (alreadyPromo) return { outcome: "skipped-already", subscriptionId: existing.id, trialEndsAt: existing.trialEndsAt ?? trialEndsAt };
  }

  const premium = await findPremiumPlan(tx, scope);
  if (!premium) return { outcome: "skipped-no-plan" };

  const promoFields = {
    planId: premium.id,
    status: SubscriptionStatus.ACTIVE,
    isTrial: true,
    trialEndsAt,
    trialEndingNotificationSentAt: null,
    currentPeriodStart: now,
    currentPeriodEnd: trialEndsAt,
    periodMonths: 1,
    autoRenew: false,
    cancelAtPeriodEnd: false,
    nextBillingAt: null,
  };

  let subscriptionId: string;
  let outcome: LaunchPromoOutcome;
  if (existing) {
    await tx.userSubscription.update({
      where: { id: existing.id },
      data: {
        ...promoFields,
        cancelledAt: null,
        graceUntil: null,
        pendingPriceOptIn: false,
        pendingPriceKopeks: null,
        priceOptIn24hSentAt: null,
        priceOptIn2hSentAt: null,
      },
    });
    subscriptionId = existing.id;
    outcome = "upgraded";
  } else {
    const created = await tx.userSubscription.create({
      data: { userId, scope, startedAt: now, ...promoFields },
      select: { id: true },
    });
    subscriptionId = created.id;
    outcome = "created";
  }

  await tx.billingAuditLog.create({
    data: {
      userId,
      scope,
      subscriptionId,
      action: "LAUNCH_PROMO_GRANTED",
      details: {
        planCode: premium.code,
        trialEndsAt: trialEndsAt.toISOString(),
        previousPlanId: existing?.planId ?? null,
        source: input.source,
      },
    },
  });

  return { outcome, subscriptionId, trialEndsAt };
}

export type LaunchPromoBackfillSummary = Record<LaunchPromoOutcome, number> & {
  failed: Array<{ userId: string; scope: SubscriptionScope; message: string }>;
};

/**
 * Бэкфилл для кабинетов, зарегистрированных ДО включения акции: каждый живой
 * пользователь с ролью мастера/студии получает PREMIUM до конца акции.
 * После окончания акции — no-op. Каждая пара (user, scope) — своя транзакция:
 * сбой одной строки не откатывает остальные.
 */
export async function backfillLaunchPromo(
  client: Pick<PrismaClient, "userProfile" | "$transaction">,
  now: Date = new Date(),
): Promise<LaunchPromoBackfillSummary> {
  const summary: LaunchPromoBackfillSummary = {
    created: 0,
    upgraded: 0,
    "skipped-promo-over": 0,
    "skipped-already": 0,
    "skipped-paid": 0,
    "skipped-no-plan": 0,
    failed: [],
  };
  if (!isLaunchPromoActive(now)) return summary;

  const users = await client.userProfile.findMany({
    where: {
      isDeleted: false,
      roles: { hasSome: [AccountType.MASTER, AccountType.STUDIO, AccountType.STUDIO_ADMIN] },
    },
    select: { id: true, roles: true },
  });

  for (const user of users) {
    for (const scope of resolveBillingScopesFromRoles(user.roles)) {
      try {
        const result = await client.$transaction((tx) =>
          grantLaunchPromoInTx(tx, { userId: user.id, scope, now, source: "deploy-backfill" }),
        );
        summary[result.outcome] += 1;
      } catch (error) {
        summary.failed.push({
          userId: user.id,
          scope,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  return summary;
}
