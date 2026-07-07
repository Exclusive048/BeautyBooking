import { NotificationType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addMonthsUtc } from "@/lib/billing/utils";
import { BILLING_PERIODS, PAST_DUE_GRACE_DAYS } from "@/lib/billing/constants";
import { resolvePlanPrice } from "@/lib/billing/pricing";
import { createBillingAuditLog } from "@/lib/billing/audit";
import { createBillingNotification } from "@/lib/billing/notifications";
import { logError, logInfo } from "@/lib/logging/logger";
import { invalidatePlanCache } from "@/lib/billing/get-current-plan";
import { getPayment, getRefund } from "@/lib/payments/yookassa/client";
import type { YookassaWebhookPayload } from "@/lib/queue/types";

/**
 * HARDENING-02 — YooKassa notifications are NOT signed (verified against the
 * official docs 2026-07-06); the incoming body is an untrusted hint. This
 * processor treats the enqueued `{ event, objectId }` as a hint and re-fetches
 * the authoritative object from the YooKassa API (`GET /v3/payments|refunds/{id}`,
 * Basic auth). Every activation / cancellation / refund decision acts ONLY on the
 * API-reported `status` / `amount` / `metadata`. A fully forged notification, at
 * worst, triggers a re-fetch that finds nothing actionable.
 *
 * Preserved billing invariants: FIX-BC-3 (idempotent grant), FIX-BC-4 (plan +
 * period + amount from the authoritative DB payment row, never the body),
 * HARDENING-01 FIX-1 (paid conversion clears trial flags), HARDENING-01 FIX-3
 * (stale renewal-cancellation guard).
 */

function getGraceUntil(now: Date): Date {
  return new Date(now.getTime() + PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000);
}

/** YooKassa `amount.value` (rubles string) → integer kopeks, or null. */
function apiAmountToKopeks(amount: { value: string; currency: string } | undefined): number | null {
  if (!amount) return null;
  const rubles = Number.parseFloat(amount.value);
  if (!Number.isFinite(rubles)) return null;
  return Math.round(rubles * 100);
}

export async function processYookassaWebhookPayload(payload: YookassaWebhookPayload): Promise<void> {
  const { event, objectId } = payload;
  if (!objectId) {
    logError("YooKassa webhook: missing object id", { event });
    return;
  }

  // ─── Refund events ─────────────────────────────────────────────────────
  // The notification's object.id is a REFUND id — re-fetch the refund to learn
  // the authoritative status + the payment it belongs to.
  if (event.startsWith("refund.")) {
    // getRefund: null on 404 (forged/foreign → drop); throws on transient
    // failure (→ the queue retries the job).
    const refund = await getRefund(objectId);
    if (!refund) {
      logInfo("YooKassa refund not found via API (forged/foreign) — dropped", { objectId });
      return;
    }
    if (refund.status !== "succeeded") {
      logInfo("YooKassa refund not succeeded — no action", { objectId, status: refund.status });
      return;
    }

    const billingPayment = await prisma.billingPayment.findUnique({
      where: { yookassaPaymentId: refund.payment_id },
      select: {
        id: true,
        status: true,
        subscriptionId: true,
        subscription: { select: { userId: true, scope: true } },
      },
    });
    if (!billingPayment) {
      logError("YooKassa refund: payment not found", { yookassaPaymentId: refund.payment_id });
      return;
    }
    // Idempotent: a duplicate / 24h-redelivered refund notification (or a
    // refund already recorded synchronously by the admin refund route) is a
    // no-op — no second REFUNDED write, no duplicate audit.
    if (billingPayment.status === "REFUNDED") {
      return;
    }

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
      details: { yookassaPaymentId: refund.payment_id, yookassaRefundId: refund.id },
    });
    return;
  }

  // Only payment.* and refund.* are handled; anything else is ignored.
  if (!event.startsWith("payment.")) {
    return;
  }

  // ─── Payment events ────────────────────────────────────────────────────
  // Authoritative re-fetch. null on 404 (forged/foreign payment id → drop);
  // throws on transient failure (→ queue retries).
  const apiPayment = await getPayment(objectId);
  if (!apiPayment) {
    logError("YooKassa webhook: payment not found via API (forged/foreign) — dropped", {
      objectId,
      event,
    });
    return;
  }

  // Act ONLY on the API-reported status. pending / waiting_for_capture are not
  // yet actionable — await the next notification (YooKassa emits payment.succeeded
  // / payment.canceled when the payment reaches a terminal state).
  if (apiPayment.status !== "succeeded" && apiPayment.status !== "canceled") {
    logInfo("YooKassa payment not yet actionable", { objectId, status: apiPayment.status });
    return;
  }

  const apiMeta =
    apiPayment.metadata && typeof apiPayment.metadata === "object" && !Array.isArray(apiPayment.metadata)
      ? (apiPayment.metadata as Record<string, unknown>)
      : {};
  const internalId = apiMeta.internalPaymentId;
  const yookassaPaymentId = apiPayment.id;

  // HARDENING-01 FIX-3: `createdAt` (payment) + `lastPaymentAt` (subscription)
  // feed the stale-cancellation guard below.
  const paymentSelect = {
    id: true,
    status: true,
    type: true,
    periodMonths: true,
    amountKopeks: true,
    metadata: true,
    createdAt: true,
    subscriptionId: true,
    subscription: {
      select: {
        id: true,
        userId: true,
        scope: true,
        planId: true,
        status: true,
        periodMonths: true,
        lastPaymentAt: true,
      },
    },
  } as const;

  const billingPayment =
    typeof internalId === "string"
      ? await prisma.billingPayment.findUnique({
          where: { id: internalId },
          select: paymentSelect,
        })
      : await prisma.billingPayment.findUnique({
          where: { yookassaPaymentId },
          select: paymentSelect,
        });

  if (!billingPayment) {
    logError("YooKassa webhook: payment not found", { yookassaPaymentId, internalId });
    return;
  }

  if (["CANCELED", "FAILED", "REFUNDED"].includes(billingPayment.status)) {
    return;
  }

  const now = new Date();

  if (apiPayment.status === "succeeded") {
    // FIX-BC-3: idempotent. A duplicate `payment.succeeded` (24h redelivery) for a
    // payment we already granted must NOT re-run the grant (which would re-anchor
    // `currentPeriodEnd`). Keyed on THIS payment row.
    if (billingPayment.status === "SUCCEEDED") {
      logInfo("YooKassa payment.succeeded ignored (already granted)", {
        paymentId: billingPayment.id,
        subscriptionId: billingPayment.subscriptionId,
      });
      return;
    }

    // FIX-BC-4: derive the granted plan + period from the AUTHORITATIVE DB payment
    // row (what checkout created), NOT the notification body. The payment's own
    // `metadata.planId` (set server-side at checkout) is the upgrade target; fall
    // back to the subscription's current plan.
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

    // FIX-BC-4 + HARDENING-02: amount consistency, defense-in-depth (non-blocking —
    // we never void a real payment). (a) resolved plan price vs the recorded amount
    // catches a price change between checkout and confirmation; (b) the API-reported
    // amount vs the recorded amount confirms YooKassa actually charged what we
    // recorded. Both surface a mismatch for admin attention, neither blocks the grant.
    const activePrices = await prisma.billingPlanPrice.findMany({
      where: { planId: grantedPlanId, isActive: true },
      select: { periodMonths: true, priceKopeks: true },
    });
    const expectedKopeks = resolvePlanPrice(activePrices, grantedPeriodMonths);
    if (expectedKopeks !== null && expectedKopeks !== billingPayment.amountKopeks) {
      logError("YooKassa webhook: resolved plan price ≠ recorded amount", {
        paymentId: billingPayment.id,
        planId: grantedPlanId,
        periodMonths: grantedPeriodMonths,
        recordedKopeks: billingPayment.amountKopeks,
        expectedKopeks,
      });
    }
    const apiKopeks = apiAmountToKopeks(apiPayment.amount);
    if (apiKopeks !== null && apiKopeks !== billingPayment.amountKopeks) {
      logError("YooKassa webhook: API-reported amount ≠ recorded amount", {
        paymentId: billingPayment.id,
        recordedKopeks: billingPayment.amountKopeks,
        apiKopeks,
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
          confirmationUrl: apiPayment.confirmation?.confirmation_url ?? null,
        },
      }),
      prisma.userSubscription.update({
        where: { id: billingPayment.subscriptionId },
        data: {
          status: "ACTIVE",
          // FIX-BC-2: the upgrade plan switch is applied HERE (on confirmed payment),
          // not pre-emptively at checkout. An abandoned upgrade never reaches this
          // point, so the active subscription stays untouched.
          planId: grantedPlanId,
          periodMonths: grantedPeriodMonths,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          nextBillingAt: periodEnd,
          graceUntil: null,
          cancelAtPeriodEnd: false,
          autoRenew: true,
          lastPaymentAt: now,
          // HARDENING-01 FIX-1: a paid conversion terminates the trial in the SAME
          // grant update, so a mid-trial payer is structurally unselectable by the
          // trial cron.
          isTrial: false,
          trialEndsAt: null,
          trialEndingNotificationSentAt: null,
          // BILLING-RENEWAL-OPTIN-02: accepting a price increase re-anchors the
          // sub here (checkout at the new price); clear the opt-in window state
          // so no stale pendingPriceOptIn / markers linger on the now-ACTIVE row.
          pendingPriceOptIn: false,
          pendingPriceKopeks: null,
          priceOptIn24hSentAt: null,
          priceOptIn2hSentAt: null,
          paymentMethodId: apiPayment.payment_method?.saved
            ? apiPayment.payment_method?.id ?? undefined
            : undefined,
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

  // apiPayment.status === "canceled" — the payment reached a terminal failed
  // state (3DS abandoned, declined, timed out, or an explicit cancel).
  {
    // Preserve the payment-row label: a `payment.failed` hint records FAILED,
    // any other cancel hint records CANCELED (YooKassa in practice only emits
    // `payment.canceled`; both map to the same API status `canceled`).
    const newStatus = event === "payment.failed" ? "FAILED" : "CANCELED";
    await prisma.billingPayment.update({
      where: { id: billingPayment.id },
      data: {
        status: newStatus,
        yookassaPaymentId: yookassaPaymentId ?? null,
        confirmationUrl: apiPayment.confirmation?.confirmation_url ?? null,
      },
    });

    // HARDENING-01 FIX-3: stale-cancellation guard. A late `canceled` for a
    // renewal the user has already re-paid past (sub ACTIVE + `lastPaymentAt`
    // newer than this payment row) must not clobber the fully-paid subscription
    // back to PAST_DUE. Renewals charge at/after `currentPeriodEnd`, so during a
    // genuine renewal failure `lastPaymentAt` still predates the renewal payment
    // row and the genuine path below stays byte-identical.
    const isStaleRenewalCancellation =
      billingPayment.type === "RENEWAL" &&
      billingPayment.subscription.status === "ACTIVE" &&
      billingPayment.subscription.lastPaymentAt !== null &&
      billingPayment.subscription.lastPaymentAt > billingPayment.createdAt;

    if (isStaleRenewalCancellation) {
      logInfo("YooKassa stale renewal cancellation ignored", {
        paymentId: billingPayment.id,
        subscriptionId: billingPayment.subscriptionId,
        event,
        paymentCreatedAt: billingPayment.createdAt.toISOString(),
        lastPaymentAt: billingPayment.subscription.lastPaymentAt?.toISOString(),
      });
      await createBillingAuditLog({
        userId: billingPayment.subscription.userId,
        scope: billingPayment.subscription.scope,
        subscriptionId: billingPayment.subscriptionId,
        paymentId: billingPayment.id,
        action: "PAYMENT_FAILED",
        details: { yookassaPaymentId, event, staleRenewalCancellation: true },
      });
      return;
    }

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
