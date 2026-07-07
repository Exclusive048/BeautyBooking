import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HARDENING-10 (refund audit-action desync) — a completed refund must record
 * one initiation (`REFUND_REQUESTED`) + one terminal (`PAYMENT_REFUNDED`)
 * billing-audit action regardless of whether YooKassa returned `succeeded`
 * synchronously (this route) or later via the webhook. The webhook side (async
 * terminal + already-REFUNDED no-op) is covered in webhook-processor.test.ts;
 * this pins the synchronous admin-route side.
 */

const requireAdminAuth = vi.hoisted(() => vi.fn());
const paymentFindFirst = vi.hoisted(() => vi.fn());
const paymentUpdate = vi.hoisted(() => vi.fn());
const createRefund = vi.hoisted(() => vi.fn());
const decideRefund = vi.hoisted(() => vi.fn());
const createBillingAuditLog = vi.hoisted(() => vi.fn());
const createAdminAuditLogSafe = vi.hoisted(() => vi.fn());
const dispatchAdminInitiatedNotification = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ requireAdminAuth }));
vi.mock("@/lib/prisma", () => ({
  prisma: { billingPayment: { findFirst: paymentFindFirst, update: paymentUpdate } },
}));
vi.mock("@/lib/payments/yookassa/client", () => ({ createRefund }));
vi.mock("@/lib/billing/refund-guard", () => ({ decideRefund }));
vi.mock("@/lib/billing/audit", () => ({ createBillingAuditLog }));
vi.mock("@/lib/audit/admin-audit", () => ({ createAdminAuditLogSafe }));
vi.mock("@/lib/audit/admin-audit-context", () => ({ getAdminAuditContext: () => ({}) }));
vi.mock("@/lib/notifications/admin-initiated", () => ({ dispatchAdminInitiatedNotification }));
vi.mock("@/lib/notifications/admin-body-templates", () => ({ buildRefundBody: () => "" }));
vi.mock("@/lib/logging/logger", () => ({ logError: vi.fn() }));

import { POST } from "./route";

function makeReq(body: unknown) {
  return new Request("http://localhost/api/admin/billing/refund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const PAYMENT = {
  id: "pay-1",
  status: "SUCCEEDED",
  amountKopeks: 50_000,
  yookassaPaymentId: "yk-1",
  subscriptionId: "sub-1",
  subscription: { userId: "user-1", scope: "MASTER" },
};

function billingActions() {
  return createBillingAuditLog.mock.calls.map((c) => c[0].action as string);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdminAuth.mockResolvedValue({ ok: true, user: { id: "admin-1" } });
  paymentFindFirst.mockResolvedValue(PAYMENT);
  paymentUpdate.mockResolvedValue({});
  decideRefund.mockReturnValue({
    ok: true,
    refundAmountKopeks: 50_000,
    idempotenceKey: "idem-1",
  });
  createBillingAuditLog.mockResolvedValue({});
  createAdminAuditLogSafe.mockResolvedValue({});
  dispatchAdminInitiatedNotification.mockResolvedValue({});
});

describe("admin refund route — audit-action scheme", () => {
  it("synchronous succeeded → one initiation + one terminal billing-audit action", async () => {
    createRefund.mockResolvedValue({ id: "ref-1", status: "succeeded" });

    const res = await POST(makeReq({ paymentId: "pay-1" }));

    expect(res.status).toBe(200);
    // marked REFUNDED synchronously (so a later webhook no-ops)
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "REFUNDED" } }),
    );
    // exactly one initiation + one terminal, in order
    expect(billingActions()).toEqual(["REFUND_REQUESTED", "PAYMENT_REFUNDED"]);
  });

  it("asynchronous pending → initiation only (webhook writes the terminal later)", async () => {
    createRefund.mockResolvedValue({ id: "ref-2", status: "pending" });

    const res = await POST(makeReq({ paymentId: "pay-1" }));

    expect(res.status).toBe(200);
    // not marked REFUNDED yet — the webhook will, then write the terminal action
    expect(paymentUpdate).not.toHaveBeenCalled();
    expect(billingActions()).toEqual(["REFUND_REQUESTED"]);
    expect(billingActions()).not.toContain("PAYMENT_REFUNDED");
    // no user notification until the refund actually completes
    expect(dispatchAdminInitiatedNotification).not.toHaveBeenCalled();
  });
});
