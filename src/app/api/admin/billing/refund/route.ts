import { z } from "zod";

import { fail, ok } from "@/lib/api/response";

import { requireAdminAuth } from "@/lib/auth/admin";

import { prisma } from "@/lib/prisma";

import { createRefund } from "@/lib/payments/yookassa/client";

import { sha256, formatTimeBucketUtc } from "@/lib/billing/utils";

import { createBillingAuditLog } from "@/lib/billing/audit";

import { createAdminAuditLogSafe } from "@/lib/audit/admin-audit";

import { getAdminAuditContext } from "@/lib/audit/admin-audit-context";

import { NotificationType } from "@prisma/client";

import { dispatchAdminInitiatedNotification } from "@/lib/notifications/admin-initiated";

import { buildRefundBody } from "@/lib/notifications/admin-body-templates";

import { logError } from "@/lib/logging/logger";



export const runtime = "nodejs";



const bodySchema = z.object({

  paymentId: z.string().trim().min(1).optional(),

  yookassaPaymentId: z.string().trim().min(1).optional(),

  amountKopeks: z.number().int().min(1).optional(),

  reason: z.string().trim().max(500).optional(),

});



export async function POST(req: Request) {

  const auth = await requireAdminAuth();

  if (!auth.ok) return auth.response;



  try {

    const body = await req.json().catch(() => null);

    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {

      return fail("Неверные данные.", 400, "VALIDATION_ERROR");

    }



    const { paymentId, yookassaPaymentId, amountKopeks, reason } = parsed.data;

    if (!paymentId && !yookassaPaymentId) {

      return fail("Укажите идентификатор платежа.", 400, "VALIDATION_ERROR");

    }



    const payment = await prisma.billingPayment.findFirst({

      where: {

        ...(paymentId ? { id: paymentId } : {}),

        ...(yookassaPaymentId ? { yookassaPaymentId } : {}),

      },

      select: {

        id: true,

        amountKopeks: true,

        yookassaPaymentId: true,

        subscriptionId: true,

        subscription: { select: { userId: true, scope: true } },

      },

    });



    if (!payment || !payment.yookassaPaymentId) {

      return fail("Платёж не найден.", 404, "NOT_FOUND");

    }



    const refundAmount = amountKopeks ?? payment.amountKopeks;

    if (refundAmount <= 0) {

      return fail("Сумма возврата должна быть больше нуля.", 400, "VALIDATION_ERROR");

    }



    const idempotenceKey = sha256(

      `refund:${payment.yookassaPaymentId}:${formatTimeBucketUtc(new Date())}`

    );



    const refund = await createRefund({

      paymentId: payment.yookassaPaymentId,

      amountKopeks: refundAmount,

      idempotenceKey,

    });



    if (refund.status === "succeeded") {

      await prisma.billingPayment.update({

        where: { id: payment.id },

        data: { status: "REFUNDED" },

      });

    }



    await createBillingAuditLog({

      userId: payment.subscription.userId,

      scope: payment.subscription.scope,

      subscriptionId: payment.subscriptionId,

      paymentId: payment.id,

      action: "REFUND_REQUESTED",

      details: {
        refundId: refund.id,
        status: refund.status,
        amountKopeks: refundAmount,
        reason: reason ?? null,
      },

    });

    // The YooKassa refund call has already mutated external state — do
    // not let an audit-write failure surface as a 500. Use the safe
    // variant; failures are logged via `logError("admin-audit.*")`.
    await createAdminAuditLogSafe({
      adminUserId: auth.user.id,
      action: "BILLING_PAYMENT_REFUNDED",
      targetType: "payment",
      targetId: payment.id,
      details: {
        refundId: refund.id,
        status: refund.status,
        amountKopeks: refundAmount,
        subscriptionId: payment.subscriptionId,
        userId: payment.subscription.userId,
      },
      reason: reason ?? null,
      context: getAdminAuditContext(req),
    });

    // Notify the user that their payment was refunded. Like the audit
    // log above, failure here must not surface as a 500 — the refund
    // already happened on YooKassa's side.
    if (refund.status === "succeeded") {
      try {
        await dispatchAdminInitiatedNotification({
          targetUserId: payment.subscription.userId,
          type: NotificationType.BILLING_PAYMENT_REFUNDED,
          title: "Платёж возвращён",
          body: buildRefundBody({
            amountKopeks: refundAmount,
            reason: reason ?? null,
          }),
          url: "/cabinet/billing",
          payload: {
            paymentId: payment.id,
            subscriptionId: payment.subscriptionId,
            refundAmountKopeks: refundAmount,
            yookassaRefundId: refund.id,
          },
        });
      } catch (notifyError) {
        logError("admin.billing.refund.notify_failed", {
          paymentId: payment.id,
          userId: payment.subscription.userId,
          error:
            notifyError instanceof Error
              ? notifyError.message
              : String(notifyError),
        });
      }
    }



    return ok({ refund });

  } catch {

    return fail("Не удалось оформить возврат.", 500, "REFUND_ERROR");

  }

}

