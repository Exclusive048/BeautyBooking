import { fail, ok } from "@/lib/api/response";
import { prisma } from "@/lib/prisma";
import { addMonthsUtc } from "@/lib/billing/utils";
import { PAST_DUE_GRACE_DAYS } from "@/lib/billing/constants";
import { isYookassaIpAllowed } from "@/lib/payments/yookassa/allowlist";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { logError } from "@/lib/logging/logger";
import { NotificationType } from "@prisma/client";

export const runtime = "nodejs";

type WebhookPayload = {
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

function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return null;
}

function getWebhookToken(req: Request): string | null {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match?.[1]?.trim() ?? null;
}

function getGraceUntil(now: Date): Date {
  return new Date(now.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

export async function POST(req: Request) {
  const ip = extractClientIp(req);
  if (!ip || !isYookassaIpAllowed(ip)) {
    logError("YooKassa webhook rejected: IP not allowed", { ip });
    return fail("Forbidden", 403, "FORBIDDEN");
  }

  const token = getWebhookToken(req);
  const expected = process.env.YOOKASSA_WEBHOOK_TOKEN?.trim();
  if (!expected || token !== expected) {
    logError("YooKassa webhook rejected: invalid token", { ip });
    return fail("Unauthorized", 401, "UNAUTHORIZED");
  }

  const payload = (await req.json().catch(() => null)) as WebhookPayload | null;
  if (!payload) {
    return fail("Bad request", 400, "BAD_REQUEST");
  }

  const event = payload.event ?? payload.type ?? "";
  const object = payload.object ?? {};

  if (event === "refund.succeeded") {
    const paymentId = payload.object?.payment_id ?? payload.payment?.id;
    if (!paymentId) return ok({ ok: true });

    const billingPayment = await prisma.billingPayment.findUnique({
      where: { yookassaPaymentId: paymentId },
      select: { id: true, subscriptionId: true, subscription: { select: { userId: true, scope: true } } },
    });
    if (!billingPayment) return ok({ ok: true });

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
    return ok({ ok: true });
  }

  if (!event.startsWith("payment.")) {
    return ok({ ok: true });
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
            subscription: { select: { id: true, userId: true, scope: true, planId: true } },
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
              subscription: { select: { id: true, userId: true, scope: true, planId: true } },
            },
          })
        : null;

  if (!billingPayment) {
    logError("YooKassa webhook: payment not found", { yookassaPaymentId, internalId });
    return ok({ ok: true });
  }

  if (["SUCCEEDED", "CANCELED", "FAILED", "REFUNDED"].includes(billingPayment.status)) {
    return ok({ ok: true });
  }

  const now = new Date();

  if (event === "payment.succeeded") {
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
      : billingPayment.periodMonths;

    const periodStart = now;
    const periodEnd = addMonthsUtc(periodStart, periodMonthsFromMeta);

    await prisma.billingPayment.update({
      where: { id: billingPayment.id },
      data: {
        status: "SUCCEEDED",
        yookassaPaymentId: yookassaPaymentId ?? null,
        confirmationUrl: object.confirmation?.confirmation_url ?? null,
      },
    });

    await prisma.userSubscription.update({
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
      title: "Оплата прошла",
      body: "Оплата подписки успешно завершена.",
      payloadJson: { scope: billingPayment.subscription.scope, subscriptionId: billingPayment.subscriptionId },
    });

    return ok({ ok: true });
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
      title: "Платёж не прошёл",
      body: "Не удалось завершить оплату подписки.",
      payloadJson: { scope: billingPayment.subscription.scope, subscriptionId: billingPayment.subscriptionId },
    });

    return ok({ ok: true });
  }

  return ok({ ok: true });
}
