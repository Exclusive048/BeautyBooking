import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HARDENING-02 — webhook processor now treats the notification as an untrusted
 * hint and re-fetches the authoritative object from the YooKassa API
 * (`getPayment` / `getRefund`). Every decision acts on the API-reported status.
 *
 * Preserved: HARDENING-01 FIX-1 (paid conversion clears trial flags), FIX-3
 * (stale renewal-cancellation guard), FIX-BC-3 (idempotent grant).
 */

const paymentFindUnique = vi.hoisted(() => vi.fn());
const paymentUpdate = vi.hoisted(() => vi.fn());
const planPriceFindMany = vi.hoisted(() => vi.fn());
const subUpdate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
const resolvePlanPrice = vi.hoisted(() => vi.fn());
const createBillingAuditLog = vi.hoisted(() => vi.fn());
const createBillingNotification = vi.hoisted(() => vi.fn());
const invalidatePlanCache = vi.hoisted(() => vi.fn());
const logInfo = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());
const getPayment = vi.hoisted(() => vi.fn());
const getRefund = vi.hoisted(() => vi.fn());

vi.mock("@/lib/prisma", () => ({
  prisma: {
    billingPayment: { findUnique: paymentFindUnique, update: paymentUpdate },
    billingPlanPrice: { findMany: planPriceFindMany },
    userSubscription: { update: subUpdate },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/billing/pricing", () => ({ resolvePlanPrice }));
vi.mock("@/lib/billing/audit", () => ({ createBillingAuditLog }));
vi.mock("@/lib/billing/notifications", () => ({ createBillingNotification }));
vi.mock("@/lib/billing/get-current-plan", () => ({ invalidatePlanCache }));
vi.mock("@/lib/logging/logger", () => ({ logInfo, logError }));
vi.mock("@/lib/payments/yookassa/client", () => ({ getPayment, getRefund }));

import { processYookassaWebhookPayload } from "./webhook-processor";

const PAYMENT_CREATED_AT = new Date("2026-07-01T00:00:00Z");

function buildPayment(overrides: {
  type?: string;
  status?: string;
  subscription?: Partial<{
    status: string;
    lastPaymentAt: Date | null;
  }>;
}) {
  return {
    id: "pay-1",
    status: overrides.status ?? "PENDING",
    type: overrides.type ?? "RENEWAL",
    periodMonths: 1,
    amountKopeks: 100_000,
    metadata: { planId: "plan-premium" },
    createdAt: PAYMENT_CREATED_AT,
    subscriptionId: "sub-1",
    subscription: {
      id: "sub-1",
      userId: "user-1",
      scope: "MASTER",
      planId: "plan-premium",
      status: overrides.subscription?.status ?? "ACTIVE",
      periodMonths: 1,
      lastPaymentAt: overrides.subscription?.lastPaymentAt ?? null,
    },
  };
}

// The AUTHORITATIVE API re-fetch shape (getPayment). `internalPaymentId` in the
// metadata is what checkout stored on the YooKassa payment; the processor looks
// the DB row up by it. Amount matches buildPayment.amountKopeks (100_000) so the
// consistency check stays quiet unless a test opts in.
function buildApiPayment(overrides: { status?: string } = {}) {
  return {
    id: "yk-1",
    status: overrides.status ?? "succeeded",
    amount: { value: "1000.00", currency: "RUB" },
    metadata: { internalPaymentId: "pay-1" },
    payment_method: { id: "pm-1", saved: true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(undefined),
  );
  paymentUpdate.mockResolvedValue({});
  subUpdate.mockResolvedValue({});
  planPriceFindMany.mockResolvedValue([]);
  resolvePlanPrice.mockReturnValue(null);
  createBillingAuditLog.mockResolvedValue({});
  createBillingNotification.mockResolvedValue({});
  invalidatePlanCache.mockResolvedValue(undefined);
  getPayment.mockResolvedValue(buildApiPayment({ status: "succeeded" }));
});

describe("API re-fetch is the authenticity anchor (HARDENING-02)", () => {
  it("webhook claims succeeded but the API says canceled → NO activation", async () => {
    // The core protection: a forged/replayed `payment.succeeded` cannot activate
    // a subscription — the worker acts on the API-reported status only.
    getPayment.mockResolvedValue(buildApiPayment({ status: "canceled" }));
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL" }));

    await processYookassaWebhookPayload({ event: "payment.succeeded", objectId: "yk-1" });

    // No grant transaction, no ACTIVE write.
    expect(transaction).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    // It IS processed as the (real) canceled state instead.
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED" }) }),
    );
  });

  it("API 404 (unknown/forged payment id) → dropped, never touches the DB", async () => {
    getPayment.mockResolvedValue(null);

    await processYookassaWebhookPayload({ event: "payment.succeeded", objectId: "yk-forged" });

    expect(paymentFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("not found via API"),
      expect.objectContaining({ objectId: "yk-forged" }),
    );
  });

  it("API status pending / waiting_for_capture → not yet actionable, dropped", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "pending" }));

    await processYookassaWebhookPayload({ event: "payment.succeeded", objectId: "yk-1" });

    expect(paymentFindUnique).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(
      "YooKassa payment not yet actionable",
      expect.objectContaining({ status: "pending" }),
    );
  });

  it("missing objectId → logged and dropped", async () => {
    await processYookassaWebhookPayload({ event: "payment.succeeded", objectId: "" });
    expect(getPayment).not.toHaveBeenCalled();
    expect(logError).toHaveBeenCalledWith(
      expect.stringContaining("missing object id"),
      expect.anything(),
    );
  });
});

describe("payment succeeded — trial conversion (FIX-1) + idempotency (FIX-BC-3)", () => {
  it("API succeeded → activates + clears trial flags in the same grant update", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "succeeded" }));
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL" }));

    await processYookassaWebhookPayload({ event: "payment.succeeded", objectId: "yk-1" });

    expect(subUpdate).toHaveBeenCalledTimes(1);
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({
          status: "ACTIVE",
          isTrial: false,
          trialEndsAt: null,
          trialEndingNotificationSentAt: null,
          lastPaymentAt: expect.any(Date),
        }),
      }),
    );
  });

  it("duplicate delivery of an already-SUCCEEDED payment does not re-grant", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "succeeded" }));
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL", status: "SUCCEEDED" }));

    await processYookassaWebhookPayload({ event: "payment.succeeded", objectId: "yk-1" });

    expect(subUpdate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("payment canceled — stale renewal guard (FIX-3)", () => {
  it("ignores a stale RENEWAL cancellation when the sub was re-anchored past this payment", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "canceled" }));
    paymentFindUnique.mockResolvedValue(
      buildPayment({
        type: "RENEWAL",
        subscription: { status: "ACTIVE", lastPaymentAt: new Date("2026-07-02T00:00:00Z") },
      }),
    );

    await processYookassaWebhookPayload({ event: "payment.canceled", objectId: "yk-1" });

    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-1" },
        data: expect.objectContaining({ status: "CANCELED" }),
      }),
    );
    expect(subUpdate).not.toHaveBeenCalled();
    expect(invalidatePlanCache).not.toHaveBeenCalled();
    expect(createBillingNotification).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(
      "YooKassa stale renewal cancellation ignored",
      expect.objectContaining({ paymentId: "pay-1", subscriptionId: "sub-1" }),
    );
    expect(createBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_FAILED",
        details: expect.objectContaining({ staleRenewalCancellation: true }),
      }),
    );
  });

  it("genuine renewal failure (lastPaymentAt predates the payment) → PAST_DUE + grace + notification", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "canceled" }));
    paymentFindUnique.mockResolvedValue(
      buildPayment({
        type: "RENEWAL",
        subscription: { status: "ACTIVE", lastPaymentAt: new Date("2026-06-01T00:00:00Z") },
      }),
    );

    // A `payment.failed` hint labels the row FAILED; the API status (canceled) drives the flow.
    await processYookassaWebhookPayload({ event: "payment.failed", objectId: "yk-1" });

    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }),
    );
    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({ status: "PAST_DUE", graceUntil: expect.any(Date) }),
      }),
    );
    expect(invalidatePlanCache).toHaveBeenCalledWith("user-1", "MASTER");
    expect(createBillingNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", title: "Платёж не прошёл" }),
    );
  });

  it("genuine renewal failure with lastPaymentAt = null (legacy rows) → PAST_DUE", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "canceled" }));
    paymentFindUnique.mockResolvedValue(
      buildPayment({ type: "RENEWAL", subscription: { status: "ACTIVE", lastPaymentAt: null } }),
    );

    await processYookassaWebhookPayload({ event: "payment.canceled", objectId: "yk-1" });

    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
    expect(createBillingNotification).toHaveBeenCalled();
  });

  it("non-RENEWAL cancellation never mutates the subscription (unchanged behavior)", async () => {
    getPayment.mockResolvedValue(buildApiPayment({ status: "canceled" }));
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL" }));

    await processYookassaWebhookPayload({ event: "payment.canceled", objectId: "yk-1" });

    expect(subUpdate).not.toHaveBeenCalled();
    expect(createBillingNotification).toHaveBeenCalled(); // user still told the payment failed
  });
});

describe("refund.succeeded — API re-fetch + idempotency", () => {
  it("API refund succeeded → marks the payment REFUNDED + audit", async () => {
    getRefund.mockResolvedValue({ id: "ref-1", status: "succeeded", payment_id: "yk-1" });
    paymentFindUnique.mockResolvedValue({
      id: "pay-1",
      status: "SUCCEEDED",
      subscriptionId: "sub-1",
      subscription: { userId: "user-1", scope: "MASTER" },
    });

    await processYookassaWebhookPayload({ event: "refund.succeeded", objectId: "ref-1" });

    expect(getRefund).toHaveBeenCalledWith("ref-1");
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pay-1" }, data: { status: "REFUNDED" } }),
    );
    expect(createBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PAYMENT_REFUNDED" }),
    );
  });

  it("duplicate refund notification for an already-REFUNDED payment is a no-op", async () => {
    getRefund.mockResolvedValue({ id: "ref-1", status: "succeeded", payment_id: "yk-1" });
    paymentFindUnique.mockResolvedValue({
      id: "pay-1",
      status: "REFUNDED",
      subscriptionId: "sub-1",
      subscription: { userId: "user-1", scope: "MASTER" },
    });

    await processYookassaWebhookPayload({ event: "refund.succeeded", objectId: "ref-1" });

    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(createBillingAuditLog).not.toHaveBeenCalled();
  });

  it("refund not found via API (404) → dropped", async () => {
    getRefund.mockResolvedValue(null);

    await processYookassaWebhookPayload({ event: "refund.succeeded", objectId: "ref-forged" });

    expect(paymentFindUnique).not.toHaveBeenCalled();
    expect(paymentUpdate).not.toHaveBeenCalled();
  });
});
