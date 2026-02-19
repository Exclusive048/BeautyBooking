import { fail, ok } from "@/lib/api/response";

import { prisma } from "@/lib/prisma";

import { createRecurringPayment } from "@/lib/payments/yookassa/client";

import { addMonthsUtc, sha256 } from "@/lib/billing/utils";

import { BILLING_PERIODS, PAST_DUE_GRACE_DAYS } from "@/lib/billing/constants";

import { createBillingAuditLog } from "@/lib/billing/audit";

import { createBillingNotification } from "@/lib/billing/notifications";

import { logError } from "@/lib/logging/logger";

import { NotificationType } from "@prisma/client";



export const runtime = "nodejs";



function getCronToken(req: Request): string | null {

  const header = req.headers.get("x-cron-token");

  if (header && header.trim().length > 0) return header.trim();

  const url = new URL(req.url);

  const token = url.searchParams.get("token");

  return token?.trim() ?? null;

}



function formatDateKeyUtc(date: Date): string {

  const year = date.getUTCFullYear();

  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;

}



export async function POST(req: Request) {

  const token = getCronToken(req);

  const expected = process.env.BILLING_RENEW_SECRET?.trim();

  if (!expected || token !== expected) {

    return fail("Р”РѕСЃС‚СѓРї Р·Р°РїСЂРµС‰С‘РЅ.", 403, "FORBIDDEN");

  }



  const now = new Date();

  const graceUntil = new Date(now.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);



  const overdue = await prisma.userSubscription.findMany({

    where: { status: "PAST_DUE", graceUntil: { lt: now } },

    select: { id: true, userId: true, scope: true },

  });



  if (overdue.length > 0) {

    await prisma.userSubscription.updateMany({

      where: { id: { in: overdue.map((item) => item.id) } },

      data: { status: "EXPIRED", autoRenew: false },

    });

    await prisma.billingAuditLog.createMany({

      data: overdue.map((item) => ({

        userId: item.userId,

        scope: item.scope,

        subscriptionId: item.id,

        action: "SUBSCRIPTION_EXPIRED",

        details: { reason: "PAST_DUE_GRACE_EXPIRED" },

      })),

    });

    for (const item of overdue) {

      await createBillingNotification({

        userId: item.userId,

        type: NotificationType.BILLING_SUBSCRIPTION_EXPIRED,

        title: "Подписка истекла",

        body: "Льготный период оплаты истёк. Подписка отключена.",

        payloadJson: { scope: item.scope, subscriptionId: item.id },

      });

    }

  }



  const cancelCandidates = await prisma.userSubscription.findMany({

    where: {

      status: "ACTIVE",

      cancelAtPeriodEnd: true,

      nextBillingAt: { lte: now },

    },

    select: { id: true, userId: true, scope: true, plan: { select: { name: true } } },

  });



  if (cancelCandidates.length > 0) {

    await prisma.userSubscription.updateMany({

      where: { id: { in: cancelCandidates.map((item) => item.id) } },

      data: { status: "CANCELLED", autoRenew: false },

    });

    await prisma.billingAuditLog.createMany({

      data: cancelCandidates.map((item) => ({

        userId: item.userId,

        scope: item.scope,

        subscriptionId: item.id,

        action: "SUBSCRIPTION_CANCELLED",

        details: { reason: "CANCEL_AT_PERIOD_END" },

      })),

    });

    for (const item of cancelCandidates) {

      await createBillingNotification({

        userId: item.userId,

        type: NotificationType.BILLING_SUBSCRIPTION_CANCELLED,

        title: "Подписка завершена",

        body: `Подписка ${item.plan.name} завершена.`,

        payloadJson: { scope: item.scope, subscriptionId: item.id },

      });

    }

  }



  const candidates = await prisma.userSubscription.findMany({

    where: {

      status: "ACTIVE",

      autoRenew: true,

      cancelAtPeriodEnd: false,

      nextBillingAt: { lte: now },

    },

    select: {

      id: true,

      userId: true,

      scope: true,

      planId: true,

      periodMonths: true,

      paymentMethodId: true,

      plan: { select: { code: true, name: true } },

    },

  });



  for (const subscription of candidates) {

    if (!BILLING_PERIODS.includes(subscription.periodMonths as (typeof BILLING_PERIODS)[number])) {

      continue;

    }



    if (!subscription.paymentMethodId) {

      await prisma.userSubscription.update({

        where: { id: subscription.id },

        data: { status: "PAST_DUE", graceUntil },

      });

      await createBillingAuditLog({

        userId: subscription.userId,

        scope: subscription.scope,

        subscriptionId: subscription.id,

        action: "RENEWAL_FAILED",

        details: { reason: "NO_PAYMENT_METHOD" },

      });

      await createBillingNotification({

        userId: subscription.userId,

        type: NotificationType.BILLING_PAYMENT_FAILED,

        title: "Не удалось списать оплату",

        body: "Для продления подписки требуется подтвердить способ оплаты.",

        payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },

      });

      continue;

    }



    const price = await prisma.billingPlanPrice.findUnique({

      where: {

        planId_periodMonths: { planId: subscription.planId, periodMonths: subscription.periodMonths },

      },

      select: { priceKopeks: true, isActive: true },

    });

    if (!price || !price.isActive) {

      await prisma.userSubscription.update({

        where: { id: subscription.id },

        data: { status: "PAST_DUE", graceUntil },

      });

      await createBillingAuditLog({

        userId: subscription.userId,

        scope: subscription.scope,

        subscriptionId: subscription.id,

        action: "RENEWAL_FAILED",

        details: { reason: "MISSING_PRICE" },

      });

      continue;

    }



    const idempotenceKey = sha256(`renew:${subscription.id}:${formatDateKeyUtc(now)}`);

    const existing = await prisma.billingPayment.findUnique({

      where: { idempotenceKey },

      select: { id: true, status: true, confirmationUrl: true },

    });



    if (existing) {

      if (existing.status === "SUCCEEDED") {

        continue;

      }



      if (existing.status === "PENDING") {

        await prisma.userSubscription.update({

          where: { id: subscription.id },

          data: { status: "PAST_DUE", graceUntil },

        });



        if (existing.confirmationUrl) {

          await createBillingNotification({

            userId: subscription.userId,

            type: NotificationType.BILLING_RENEWAL_CONFIRMATION_REQUIRED,

            title: "??????????? ??????",

            body: "??? ????????? ???????? ????????? ????????????? ???????.",

            payloadJson: {

              scope: subscription.scope,

              subscriptionId: subscription.id,

              confirmationUrl: existing.confirmationUrl,

            },

          });

        } else {

          logError("Renewal payment pending without confirmation URL", {

            paymentId: existing.id,

            subscriptionId: subscription.id,

          });

        }



        await createBillingAuditLog({

          userId: subscription.userId,

          scope: subscription.scope,

          subscriptionId: subscription.id,

          paymentId: existing.id,

          action: "RENEWAL_NEEDS_CONFIRMATION",

          details: { confirmationUrl: existing.confirmationUrl },

        });



        continue;

      }



      await prisma.userSubscription.update({

        where: { id: subscription.id },

        data: { status: "PAST_DUE", graceUntil },

      });



      await createBillingAuditLog({

        userId: subscription.userId,

        scope: subscription.scope,

        subscriptionId: subscription.id,

        paymentId: existing.id,

        action: "RENEWAL_FAILED",

        details: { reason: `EXISTING_${existing.status}` },

      });



      continue;

    }



    const payment = await prisma.billingPayment.create({

      data: {

        subscriptionId: subscription.id,

        type: "RENEWAL",

        status: "PENDING",

        amountKopeks: price.priceKopeks,

        currency: "RUB",

        periodMonths: subscription.periodMonths,

        idempotenceKey,

        metadata: {

          userId: subscription.userId,

          scope: subscription.scope,

          planId: subscription.planId,

          planCode: subscription.plan.code,

          subscriptionId: subscription.id,

          periodMonths: subscription.periodMonths,

          type: "RENEWAL",

        },

      },

      select: { id: true },

    });



    try {

      const yookassa = await createRecurringPayment({

        amountKopeks: price.priceKopeks,

        paymentMethodId: subscription.paymentMethodId,

        description: `Автопродление ${subscription.plan.name}`,

        idempotenceKey,

        metadata: {

          internalPaymentId: payment.id,

          userId: subscription.userId,

          scope: subscription.scope,

          planId: subscription.planId,

          planCode: subscription.plan.code,

          subscriptionId: subscription.id,

          periodMonths: subscription.periodMonths,

          type: "RENEWAL",

        },

      });



      if (yookassa.status === "succeeded") {

        const periodStart = now;

        const periodEnd = addMonthsUtc(periodStart, subscription.periodMonths);

        await prisma.billingPayment.update({

          where: { id: payment.id },

          data: { status: "SUCCEEDED", yookassaPaymentId: yookassa.paymentId },

        });

        await prisma.userSubscription.update({

          where: { id: subscription.id },

          data: {

            status: "ACTIVE",

            currentPeriodStart: periodStart,

            currentPeriodEnd: periodEnd,

            nextBillingAt: periodEnd,

            graceUntil: null,

            lastPaymentAt: now,

          },

        });

        await createBillingAuditLog({

          userId: subscription.userId,

          scope: subscription.scope,

          subscriptionId: subscription.id,

          paymentId: payment.id,

          action: "RENEWAL_SUCCEEDED",

          details: { periodMonths: subscription.periodMonths },

        });

        await createBillingNotification({

          userId: subscription.userId,

          type: NotificationType.BILLING_PAYMENT_SUCCEEDED,

          title: "Оплата прошла",

          body: "Подписка успешно продлена.",

          payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },

        });

        continue;

      }



      if (yookassa.status === "pending") {

        await prisma.billingPayment.update({

          where: { id: payment.id },

          data: {

            status: "PENDING",

            yookassaPaymentId: yookassa.paymentId,

            confirmationUrl: yookassa.confirmationUrl,

          },

        });

        await prisma.userSubscription.update({

          where: { id: subscription.id },

          data: { status: "PAST_DUE", graceUntil },

        });

        await createBillingAuditLog({

          userId: subscription.userId,

          scope: subscription.scope,

          subscriptionId: subscription.id,

          paymentId: payment.id,

          action: "RENEWAL_NEEDS_CONFIRMATION",

          details: { confirmationUrl: yookassa.confirmationUrl },

        });

        await createBillingNotification({

          userId: subscription.userId,

          type: NotificationType.BILLING_RENEWAL_CONFIRMATION_REQUIRED,

          title: "Подтвердите оплату",

          body: "Банк запросил подтверждение платежа для продления подписки.",

          payloadJson: {

            scope: subscription.scope,

            subscriptionId: subscription.id,

            confirmationUrl: yookassa.confirmationUrl,

          },

        });

        continue;

      }



      await prisma.billingPayment.update({

        where: { id: payment.id },

        data: { status: "FAILED", yookassaPaymentId: yookassa.paymentId },

      });

      await prisma.userSubscription.update({

        where: { id: subscription.id },

        data: { status: "PAST_DUE", graceUntil },

      });

      await createBillingAuditLog({

        userId: subscription.userId,

        scope: subscription.scope,

        subscriptionId: subscription.id,

        paymentId: payment.id,

        action: "RENEWAL_FAILED",

        details: { status: yookassa.status },

      });

      await createBillingNotification({

        userId: subscription.userId,

        type: NotificationType.BILLING_PAYMENT_FAILED,

        title: "Не удалось списать оплату",

        body: "Оплата продления не прошла. Проверьте способ оплаты.",

        payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },

      });

    } catch {

      await prisma.billingPayment.update({

        where: { id: payment.id },

        data: { status: "FAILED" },

      });

      await prisma.userSubscription.update({

        where: { id: subscription.id },

        data: { status: "PAST_DUE", graceUntil },

      });

      await createBillingAuditLog({

        userId: subscription.userId,

        scope: subscription.scope,

        subscriptionId: subscription.id,

        paymentId: payment.id,

        action: "RENEWAL_FAILED",

        details: { reason: "REQUEST_FAILED" },

      });

      await createBillingNotification({

        userId: subscription.userId,

        type: NotificationType.BILLING_PAYMENT_FAILED,

        title: "Не удалось списать оплату",

        body: "Попробуйте снова или обновите способ оплаты.",

        payloadJson: { scope: subscription.scope, subscriptionId: subscription.id },

      });

    }

  }



  const stuck = await prisma.billingPayment.findMany({

    where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) } },

    select: { id: true, subscriptionId: true, createdAt: true },

  });

  if (stuck.length > 0) {

    logError("Billing payments stuck in PENDING", {

      count: stuck.length,

      paymentIds: stuck.map((item) => item.id),

    });

  }



  return ok({ ok: true, renewed: candidates.length });

}

