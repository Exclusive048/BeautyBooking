import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addMonthsUtc } from "@/lib/billing/utils";
import { BILLING_PERIODS, PAST_DUE_GRACE_DAYS } from "@/lib/billing/constants";
import { resolvePlanPrice } from "@/lib/billing/pricing";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { logError, logInfo } from "@/lib/logging/logger";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";

export type YookassaWebhookPayload = {
  event?: string;
  type?: string;
  object?: {
    id?: string;
    status?: string;
    metadata?: Record<string, unknown> | null;
    payment_method?: { id?: string; saved?: boolean };
    confirmation?: { confirmation_url?: string };
    payment_id?: string;
  };
  payment?: {
    id?: string;
  };
};

function getGraceUntil(now: Date): Date {
  return new Date(now.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export async function processYookassaWebhookPayload(payload: YookassaWebhookPayload): Promise<void> {
  const event = payload.event ?? payload.type ?? "";
  const object = payload.object ?? {};

  if (event === "refund.succeeded") {
    const paymentId = payload.object?.payment_id ?? payload.payment?.id;
    if (!paymentId) return;

    const billingPayment = await prisma.billingPayment.findUnique({
      where: { yookassaPaymentId: paymentId },
      select: { id: true, subscriptionId: true, subscription: { select: { userId: true, scope: true } } },
    });
    if (!billingPayment) return;

    await prisma.billingPayment.update({
      where: { id: billingPayment.id },
      data: { status: "REFUNDED" },
    });
    await createBillingAuditLog({
      userId: billingPayment.subscription.userId,
      scope: billingPayment.subscription.scope,
      subscriptionId: billingPayment.subscriptionId,
      paymentId: billingPayment.id,
      action: "PAYMENT_REFUNDED",
      details: { yookassaPaymentId: paymentId },
    });
    return;
  }

  if (!event.startsWith("payment.")) {
    return;
  }

  const internalId = object.metadata?.internalPaymentId;
  const yookassaPaymentId = object.id;

  const billingPayment =
    typeof internalId === "string"
      ? await prisma.billingPayment.findUnique({
          where: { id: internalId },
          select: {
            id: true,
            status: true,
            type: true,
            periodMonths: true,
            amountKopeks: true,
            metadata: true,
            subscriptionId: true,
            subscription: {
              select: { id: true, userId: true, scope: true, planId: true, status: true, periodMonths: true },
            },
          },
        })
      : yookassaPaymentId
        ? await prisma.billingPayment.findUnique({
            where: { yookassaPaymentId },
            select: {
              id: true,
              status: true,
              type: true,
              periodMonths: true,
              amountKopeks: true,
              metadata: true,
              subscriptionId: true,
              subscription: {
                select: { id: true, userId: true, scope: true, planId: true, status: true, periodMonths: true },
              },
            },
          })
        : null;

  if (!billingPayment) {
    logError("YooKassa webhook: payment not found", { yookassaPaymentId, internalId });
    return;
  }

  if (["CANCELED", "FAILED", "REFUNDED"].includes(billingPayment.status)) {
    return;
  }

  const now = new Date();

  if (event === "payment.succeeded") {
    // FIX-BC-3: idempotent. A duplicate `payment.succeeded` for a payment we
    // already granted must NOT re-run the grant (which would re-anchor
    // `currentPeriodEnd` to the later timestamp). Keyed on THIS payment row
    // (resolved above by `internalPaymentId`/`yookassaPaymentId`), not merely on
    // "some row exists".
    if (billingPayment.status === "SUCCEEDED") {
      logInfo("YooKassa payment.succeeded ignored (already granted)", {
        paymentId: billingPayment.id,
        subscriptionId: billingPayment.subscriptionId,
      });
      return;
    }

    // FIX-BC-4: derive the granted plan + period from the AUTHORITATIVE DB
    // payment row (what checkout created), NOT the mutable webhook metadata — a
    // tampered `object.metadata.periodMonths` can no longer inflate the granted
    // term. The payment's own `metadata.planId` (set server-side at checkout) is
    // the upgrade target; fall back to the subscription's current plan.
    const paymentMeta =
      billingPayment.metadata && typeof billingPayment.metadata === "object" && !Array.isArray(billingPayment.metadata)
        ? (billingPayment.metadata as Record<string, unknown>)
        : {};
    const metaPlanId = paymentMeta.planId;
    const grantedPlanId =
      typeof metaPlanId === "string" && metaPlanId.length > 0
        ? metaPlanId
        : billingPayment.subscription.planId;

    let grantedPeriodMonths = billingPayment.periodMonths;
    if (!BILLING_PERIODS.includes(grantedPeriodMonths as (typeof BILLING_PERIODS)[number])) {
      logError("YooKassa webhook: payment.periodMonths not in BILLING_PERIODS", {
        paymentId: billingPayment.id,
        periodMonths: grantedPeriodMonths,
      });
      grantedPeriodMonths = BILLING_PERIODS.includes(
        billingPayment.subscription.periodMonths as (typeof BILLING_PERIODS)[number],
      )
        ? billingPayment.subscription.periodMonths
        : 1;
    }

    // FIX-BC-4: amount↔term consistency check (defense-in-depth, non-blocking —
    // we never void a real payment, but a mismatch is surfaced for admin
    // attention, e.g. an admin changed the price between checkout and webhook).
    const activePrices = await prisma.billingPlanPrice.findMany({
      where: { planId: grantedPlanId, isActive: true },
      select: { periodMonths: true, priceKopeks: true },
    });
    const expectedKopeks = resolvePlanPrice(activePrices, grantedPeriodMonths);
    if (expectedKopeks !== null && expectedKopeks !== billingPayment.amountKopeks) {
      logError("YooKassa webhook: paid amount ≠ resolved plan price", {
        paymentId: billingPayment.id,
        planId: grantedPlanId,
        periodMonths: grantedPeriodMonths,
        paidKopeks: billingPayment.amountKopeks,
        expectedKopeks,
      });
    }

    const periodStart = now;
    const periodEnd = addMonthsUtc(periodStart, grantedPeriodMonths);

    await prisma.$transaction([
      prisma.billingPayment.update({
        where: { id: billingPayment.id },
        data: {
          status: "SUCCEEDED",
          yookassaPaymentId: yookassaPaymentId ?? null,
          confirmationUrl: object.confirmation?.confirmation_url ?? null,
        },
      }),
      prisma.userSubscription.update({
        where: { id: billingPayment.subscriptionId },
        data: {
          status: "ACTIVE",
          // FIX-BC-2: the upgrade plan switch is applied HERE (on confirmed
          // payment), not pre-emptively at checkout. An abandoned upgrade never
          // reaches this point, so the active subscription stays untouched.
          planId: grantedPlanId,
          periodMonths: grantedPeriodMonths,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
          graceUntil: null,
          cancelAtPeriodEnd: false,
          autoRenew: true,
          lastPaymentAt: now,
          paymentMethodId: object.payment_method?.saved ? object.payment_method?.id ?? undefined : undefined,
        },
      }),
    ]);

    await invalidatePlanCache(billingPayment.subscription.userId, billingPayment.subscription.scope);

    logInfo("YooKassa payment succeeded", {
      paymentId: billingPayment.id,
      subscriptionId: billingPayment.subscriptionId,
      userId: billingPayment.subscription.userId,
    });

    await createBillingAuditLog({
      userId: billingPayment.subscription.userId,
      scope: billingPayment.subscription.scope,
      subscriptionId: billingPayment.subscriptionId,
      paymentId: billingPayment.id,
      action: "PAYMENT_SUCCEEDED",
      details: { yookassaPaymentId },
    });

    await createBillingNotification({
      userId: billingPayment.subscription.userId,
      type: NotificationType.BILLING_PAYMENT_SUCCEEDED,
      scope: billingPayment.subscription.scope,
      title: "Оплата прошла",
      body: "Оплата подписки успешно завершена.",
      payloadJson: { scope: billingPayment.subscription.scope, subscriptionId: billingPayment.subscriptionId },
    });
    return;
  }

  if (event === "payment.canceled" || event === "payment.failed") {
    const newStatus = event === "payment.canceled" ? "CANCELED" : "FAILED";
    await prisma.billingPayment.update({
      where: { id: billingPayment.id },
      data: {
        status: newStatus,
        yookassaPaymentId: yookassaPaymentId ?? null,
        confirmationUrl: object.confirmation?.confirmation_url ?? null,
      },
    });

    if (billingPayment.type === "RENEWAL") {
      await prisma.userSubscription.update({
        where: { id: billingPayment.subscriptionId },
        data: { status: "PAST_DUE", graceUntil: getGraceUntil(now) },
      });
      await invalidatePlanCache(billingPayment.subscription.userId, billingPayment.subscription.scope);
    }

    await createBillingAuditLog({
      userId: billingPayment.subscription.userId,
      scope: billingPayment.subscription.scope,
      subscriptionId: billingPayment.subscriptionId,
      paymentId: billingPayment.id,
      action: "PAYMENT_FAILED",
      details: { yookassaPaymentId, event },
    });

    await createBillingNotification({
      userId: billingPayment.subscription.userId,
      type: NotificationType.BILLING_PAYMENT_FAILED,
      scope: billingPayment.subscription.scope,
      title: "Платёж не прошёл",
      body: "Не удалось завершить оплату подписки.",
      payloadJson: { scope: billingPayment.subscription.scope, subscriptionId: billingPayment.subscriptionId },
    });
  }
}
