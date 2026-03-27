import { z } from "zod";
import { ok, fail } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { createInitialPayment } from "@/lib/payments/yookassa/client";
import { BILLING_PERIODS, BILLING_YEARLY_DISCOUNT } from "@/lib/billing/constants";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { formatTimeBucketUtc, sha256 } from "@/lib/billing/utils";
import { isCurrentMasterManagedByStudio } from "@/lib/master/access";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";

export const runtime = "nodejs";

const bodySchema = z.object({
  scope: z.enum(["MASTER", "STUDIO"]),
  planId: z.string().trim().min(1),
  periodMonths: z.number().int().refine((value) => BILLING_PERIODS.includes(value as (typeof BILLING_PERIODS)[number])),
  returnUrl: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Необходима авторизация.", 401, "UNAUTHORIZED");

  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Неверные данные оплаты.", 400, "VALIDATION_ERROR");
  }

  const { scope, planId, periodMonths, returnUrl } = parsed.data;

  if (scope === "MASTER") {
    const managedByStudio = await isCurrentMasterManagedByStudio(user.id);
    if (managedByStudio) {
      return fail("Тарифом мастера в студии управляет студия.", 403, "FORBIDDEN");
    }
  }

  const plan = await prisma.billingPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      code: true,
      name: true,
      tier: true,
      scope: true,
      isActive: true,
      prices: {
        where: {
          isActive: true,
          periodMonths: { in: periodMonths === 12 ? [1, 12] : [periodMonths] },
        },
        select: { periodMonths: true, priceKopeks: true },
      },
    },
  });

  if (!plan || !plan.isActive) {
    return fail("Тариф не найден.", 404, "NOT_FOUND");
  }
  if (plan.scope !== scope) {
    return fail("Тариф не относится к выбранному разделу.", 400, "VALIDATION_ERROR");
  }

  const monthlyPriceKopeks = plan.prices.find((entry) => entry.periodMonths === 1)?.priceKopeks ?? null;
  const selectedPeriodPriceKopeks =
    plan.prices.find((entry) => entry.periodMonths === periodMonths)?.priceKopeks ?? null;
  const priceKopeks =
    periodMonths === 12 && monthlyPriceKopeks !== null
      ? Math.floor(monthlyPriceKopeks * 12 * (1 - BILLING_YEARLY_DISCOUNT))
      : selectedPeriodPriceKopeks ??
        (monthlyPriceKopeks !== null ? monthlyPriceKopeks * periodMonths : null);
  if (priceKopeks === null) {
    return fail("Цена для выбранного срока не найдена.", 404, "NOT_FOUND");
  }

  const now = new Date();
  const existing = await prisma.userSubscription.findUnique({
    where: { userId_scope: { userId: user.id, scope } },
    select: { id: true, status: true, planId: true },
  });

  if (priceKopeks <= 0 || plan.tier === "FREE") {
    const subscription = await prisma.userSubscription.upsert({
      where: { userId_scope: { userId: user.id, scope } },
      create: {
        userId: user.id,
        scope,
        planId: plan.id,
        status: "ACTIVE",
        startedAt: now,
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths,
        autoRenew: false,
        cancelAtPeriodEnd: false,
      },
      update: {
        planId: plan.id,
        status: "ACTIVE",
        currentPeriodStart: now,
        currentPeriodEnd: null,
        periodMonths,
        autoRenew: false,
        cancelAtPeriodEnd: false,
        graceUntil: null,
        nextBillingAt: null,
      },
      select: { id: true },
    });

    await invalidatePlanCache(user.id, scope);

    await createBillingAuditLog({
      userId: user.id,
      scope,
      subscriptionId: subscription.id,
      action: "FREE_ACTIVATED",
      details: { planId: plan.id, planCode: plan.code, periodMonths },
    });

    return ok({ mode: "free-activated" });
  }

  let subscriptionId = existing?.id ?? null;
  if (!existing) {
    const created = await prisma.userSubscription.create({
      data: {
        userId: user.id,
        scope,
        planId: plan.id,
        status: "PENDING",
        startedAt: now,
        periodMonths,
        autoRenew: true,
        cancelAtPeriodEnd: false,
      },
      select: { id: true },
    });
    subscriptionId = created.id;
  } else if (existing.status !== "ACTIVE") {
    await prisma.userSubscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "PENDING",
        periodMonths,
        autoRenew: true,
        cancelAtPeriodEnd: false,
      },
    });
  } else if (existing.planId !== plan.id) {
    await prisma.userSubscription.update({
      where: { id: existing.id },
      data: {
        cancelAtPeriodEnd: true,
        autoRenew: false,
      },
    });
  }

  if (!subscriptionId) {
    return fail("Не удалось создать подписку.", 500, "SUBSCRIPTION_ERROR");
  }

  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const recentPending = await prisma.billingPayment.findFirst({
    where: {
      subscriptionId,
      status: "PENDING",
      periodMonths,
      createdAt: { gte: thirtyMinutesAgo },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, confirmationUrl: true },
  });

  if (recentPending?.confirmationUrl) {
    return ok({ confirmationUrl: recentPending.confirmationUrl, reused: true });
  }

  const idempotenceKey = sha256(
    `${user.id}:${scope}:${plan.id}:${periodMonths}:${formatTimeBucketUtc(now)}`
  );

  const existingByKey = await prisma.billingPayment.findUnique({
    where: { idempotenceKey },
    select: { confirmationUrl: true, status: true },
  });

  if (existingByKey) {
    if (existingByKey.status === "PENDING" && existingByKey.confirmationUrl) {
      return ok({ confirmationUrl: existingByKey.confirmationUrl, reused: true });
    }
    if (existingByKey.status === "SUCCEEDED") {
      return ok({ mode: "already-paid", reused: true });
    }
    if (existingByKey.status === "PENDING") {
      return ok({ mode: "pending", reused: true });
    }
    return fail("Платёж уже существует. Попробуйте позже.", 409, "PAYMENT_ALREADY_EXISTS");
  }

  const payment = await prisma.billingPayment.create({
    data: {
      subscriptionId,
      type: existing && existing.planId !== plan.id ? "UPGRADE" : "INITIAL",
      status: "PENDING",
      amountKopeks: priceKopeks,
      currency: "RUB",
      periodMonths,
      idempotenceKey,
      metadata: {
        userId: user.id,
        scope,
        planId: plan.id,
        planCode: plan.code,
        subscriptionId,
        periodMonths,
        type: existing && existing.planId !== plan.id ? "UPGRADE" : "INITIAL",
      },
    },
    select: { id: true },
  });

  await createBillingAuditLog({
    userId: user.id,
    scope,
    subscriptionId,
    paymentId: payment.id,
    action: "CHECKOUT_CREATED",
    details: { planId: plan.id, planCode: plan.code, periodMonths },
  });

  try {
    const yookassa = await createInitialPayment({
      amountKopeks: priceKopeks,
      description: `Подписка ${plan.name} на ${periodMonths} мес.`,
      returnUrl,
      idempotenceKey,
      metadata: {
        internalPaymentId: payment.id,
        userId: user.id,
        scope,
        planId: plan.id,
        planCode: plan.code,
        subscriptionId,
        periodMonths,
        type: existing && existing.planId !== plan.id ? "UPGRADE" : "INITIAL",
      },
    });

    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { yookassaPaymentId: yookassa.paymentId, confirmationUrl: yookassa.confirmationUrl },
    });

    return ok({ confirmationUrl: yookassa.confirmationUrl });
  } catch {
    await prisma.billingPayment.update({
      where: { id: payment.id },
      data: { status: "FAILED" },
    });
    return fail("Не удалось создать оплату.", 500, "PAYMENT_ERROR");
  }
}
