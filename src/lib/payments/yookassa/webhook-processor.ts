import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addMonthsUtc } from "@/lib/billing/utils";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing/constants";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { logError, logInfo } from "@/lib/logging/logger";

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
    const alreadySucceeded = billingPayment.status === "SUCCEEDED";
    const planIdFromMeta = typeof object.metadata?.planId === "string" ? object.metadata?.planId : null;
    const rawPeriod = object.metadata?.periodMonths;
    const parsedPeriod =
      typeof rawPeriod === "number"
        ? rawPeriod
        : typeof rawPeriod === "string"
          ? Number(rawPeriod)
          : NaN;
    const periodMonthsFromMeta = Number.isFinite(parsedPeriod)
      ? parsedPeriod
      : billingPayment.periodMonths > 0
        ? billingPayment.periodMonths
        : billingPayment.subscription.periodMonths;

    const periodStart = now;
    const periodEnd = addMonthsUtc(periodStart, periodMonthsFromMeta);

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
          planId: planIdFromMeta ?? billingPayment.subscription.planId,
          periodMonths: periodMonthsFromMeta,
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

    logInfo("YooKassa payment succeeded", {
      paymentId: billingPayment.id,
      subscriptionId: billingPayment.subscriptionId,
      userId: billingPayment.subscription.userId,
      alreadySucceeded,
    });

    if (!alreadySucceeded) {
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
        title: "РћРїР»Р°С‚Р° РїСЂРѕС€Р»Р°",
        body: "РћРїР»Р°С‚Р° РїРѕРґРїРёСЃРєРё СѓСЃРїРµС€РЅРѕ Р·Р°РІРµСЂС€РµРЅР°.",
        payloadJson: { scope: billingPayment.subscription.scope, subscriptionId: billingPayment.subscriptionId },
      });
    }
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
      title: "РџР»Р°С‚С‘Р¶ РЅРµ РїСЂРѕС€С‘Р»",
      body: "РќРµ СѓРґР°Р»РѕСЃСЊ Р·Р°РІРµСЂС€РёС‚СЊ РѕРїР»Р°С‚Сѓ РїРѕРґРїРёСЃРєРё.",
      payloadJson: { scope: billingPayment.subscription.scope, subscriptionId: billingPayment.subscriptionId },
    });
  }
}
