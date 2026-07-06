import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HARDENING-01 (bug hunt 2026-07-06, findings #1 + #3) — webhook processor:
 *
 *  FIX-1: `payment.succeeded` must clear `isTrial` / `trialEndsAt` /
 *  `trialEndingNotificationSentAt` in the SAME grant update — a mid-trial
 *  payer must be structurally unselectable by the trial cron.
 *
 *  FIX-3: a stale `payment.canceled`/`payment.failed` for a RENEWAL payment
 *  the user has already re-paid past (sub ACTIVE + lastPaymentAt newer than
 *  the payment row) must NOT clobber the subscription back to PAST_DUE.
 *  The genuine renewal-failure path stays byte-identical.
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

beforeEach(() => {
  vi.clearAllMocks();
  // Array form: prisma.$transaction([op1, op2]) — ops are already promises
  // from the mocked update fns; callback form delegates for completeness.
  transaction.mockImplementation(async (arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(undefined),
  );
  paymentUpdate.mockResolvedValue({});
  subUpdate.mockResolvedValue({});
  planPriceFindMany.mockResolvedValue([]);
  resolvePlanPrice.mockReturnValue(null); // no price-mismatch branch by default
  createBillingAuditLog.mockResolvedValue({});
  createBillingNotification.mockResolvedValue({});
  invalidatePlanCache.mockResolvedValue(undefined);
});

describe("payment.succeeded — trial conversion (FIX-1)", () => {
  it("clears isTrial / trialEndsAt / trialEndingNotificationSentAt in the same grant update", async () => {
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL" }));

    await processYookassaWebhookPayload({
      event: "payment.succeeded",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

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

  it("does not re-grant an already-SUCCEEDED payment (idempotency preserved)", async () => {
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL", status: "SUCCEEDED" }));

    await processYookassaWebhookPayload({
      event: "payment.succeeded",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

    expect(subUpdate).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe("payment.canceled/failed — stale renewal guard (FIX-3)", () => {
  it("ignores a stale RENEWAL cancellation when the sub was re-anchored past this payment", async () => {
    paymentFindUnique.mockResolvedValue(
      buildPayment({
        type: "RENEWAL",
        subscription: {
          status: "ACTIVE",
          // Re-paid AFTER the stale renewal payment was created.
          lastPaymentAt: new Date("2026-07-02T00:00:00Z"),
        },
      }),
    );

    await processYookassaWebhookPayload({
      event: "payment.canceled",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

    // Payment-row bookkeeping still happens…
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-1" },
        data: expect.objectContaining({ status: "CANCELED" }),
      }),
    );
    // …but the subscription is untouched and the user is not notified.
    expect(subUpdate).not.toHaveBeenCalled();
    expect(invalidatePlanCache).not.toHaveBeenCalled();
    expect(createBillingNotification).not.toHaveBeenCalled();
    expect(logInfo).toHaveBeenCalledWith(
      "YooKassa stale renewal cancellation ignored",
      expect.objectContaining({ paymentId: "pay-1", subscriptionId: "sub-1" }),
    );
    // Audit trail records the stale event for forensics.
    expect(createBillingAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "PAYMENT_FAILED",
        details: expect.objectContaining({ staleRenewalCancellation: true }),
      }),
    );
  });

  it("genuine renewal failure (lastPaymentAt predates the payment) → PAST_DUE + grace + notification", async () => {
    paymentFindUnique.mockResolvedValue(
      buildPayment({
        type: "RENEWAL",
        subscription: {
          status: "ACTIVE",
          // Last successful payment was BEFORE this renewal attempt.
          lastPaymentAt: new Date("2026-06-01T00:00:00Z"),
        },
      }),
    );

    await processYookassaWebhookPayload({
      event: "payment.failed",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

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

  it("genuine renewal failure with lastPaymentAt = null (legacy rows) → PAST_DUE unchanged", async () => {
    paymentFindUnique.mockResolvedValue(
      buildPayment({ type: "RENEWAL", subscription: { status: "ACTIVE", lastPaymentAt: null } }),
    );

    await processYookassaWebhookPayload({
      event: "payment.canceled",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
    expect(createBillingNotification).toHaveBeenCalled();
  });

  it("does not skip when the sub is not ACTIVE (still awaiting exactly this renewal)", async () => {
    paymentFindUnique.mockResolvedValue(
      buildPayment({
        type: "RENEWAL",
        subscription: {
          status: "PAST_DUE",
          lastPaymentAt: new Date("2026-07-02T00:00:00Z"),
        },
      }),
    );

    await processYookassaWebhookPayload({
      event: "payment.canceled",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

    expect(subUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "PAST_DUE" }) }),
    );
  });

  it("non-RENEWAL cancellation never mutates the subscription (unchanged behavior)", async () => {
    paymentFindUnique.mockResolvedValue(buildPayment({ type: "INITIAL" }));

    await processYookassaWebhookPayload({
      event: "payment.canceled",
      object: { id: "yk-1", metadata: { internalPaymentId: "pay-1" } },
    });

    expect(subUpdate).not.toHaveBeenCalled();
    expect(createBillingNotification).toHaveBeenCalled(); // user still told the payment failed
  });
});
