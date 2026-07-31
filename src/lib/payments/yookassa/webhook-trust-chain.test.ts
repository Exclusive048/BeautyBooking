import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * PAY-SEC-01 (2026-07-31) — the safety argument for running production with
 * `YOOKASSA_IP_ALLOWLIST_ENFORCED=false`, pinned as an executable test.
 *
 * The decision is: do NOT enforce the source-IP allowlist in production,
 * because enforcement can drop LEGITIMATE payment webhooks (wrong
 * `TRUSTED_PROXY_HOPS`, or YooKassa silently rotating its published ranges),
 * and it guarantees nothing the worker's API re-fetch does not already.
 *
 * That is only sound while BOTH halves of the chain hold:
 *   route     — forwards nothing but `{ event, object.id }`; every
 *               attacker-supplied status/amount/metadata is dropped at ingress;
 *   processor — re-fetches the object from the YooKassa API and mutates billing
 *               state ONLY from the API-reported values.
 *
 * The existing suites cover each half separately (`webhook/route.test.ts`,
 * `webhook-processor.test.ts`). This file composes them end-to-end with the
 * allowlist explicitly OFF and the request arriving from an arbitrary internet
 * IP — i.e. exactly the production posture the decision authorises. If anyone
 * later makes the processor trust the notification body, this fails and points
 * back at the decision that depended on it.
 */

// ── Route-side mocks ────────────────────────────────────────────────────────
const mockEnv = vi.hoisted(() => ({
  YOOKASSA_WEBHOOK_TOKEN: undefined as string | undefined,
  NODE_ENV: "test" as string,
  // The posture under test: allowlist OFF.
  YOOKASSA_IP_ALLOWLIST_ENFORCED: false as boolean,
  TRUSTED_PROXY_HOPS: 1 as number,
  TRUSTED_REAL_IP_HEADER: "" as string,
}));
const enqueue = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/monitoring", () => ({ alertCritical: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/monitoring/api-alerts", () => ({ alertWebhookFailure: vi.fn(), track5xxError: vi.fn() }));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));

// ── Processor-side mocks ────────────────────────────────────────────────────
const paymentFindUnique = vi.hoisted(() => vi.fn());
const paymentUpdate = vi.hoisted(() => vi.fn());
const planPriceFindMany = vi.hoisted(() => vi.fn());
const subUpdate = vi.hoisted(() => vi.fn());
const transaction = vi.hoisted(() => vi.fn());
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
vi.mock("@/lib/payments/yookassa/client", () => ({ getPayment, getRefund }));
vi.mock("@/lib/billing/pricing", () => ({ resolvePlanPrice: vi.fn(() => null) }));
vi.mock("@/lib/billing/audit", () => ({ createBillingAuditLog: vi.fn() }));
vi.mock("@/lib/billing/notifications", () => ({ createBillingNotification: vi.fn() }));
vi.mock("@/lib/billing/get-current-plan", () => ({ invalidatePlanCache: vi.fn() }));

// Partial mock: the route's `fail()`/`withRequestContext` need the real
// `withRequestId`; only the sinks are silenced.
vi.mock("@/lib/logging/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/logging/logger")>()),
  logError: vi.fn(),
  logInfo: vi.fn(),
}));

import { POST } from "@/app/api/payments/yookassa/webhook/route";
import { processYookassaWebhookPayload } from "./webhook-processor";

const URL_BASE = "http://localhost/api/payments/yookassa/webhook";
/** Arbitrary internet IP — NOT in YOOKASSA_ALLOWED_IP_RANGES. */
const ATTACKER_IP = "203.0.113.9";

/** A maximally hostile notification: every field an attacker would want. */
const FORGED_BODY = {
  type: "notification",
  event: "payment.succeeded",
  object: {
    id: "yk-forged-001",
    status: "succeeded",
    paid: true,
    amount: { value: "999999.00", currency: "RUB" },
    metadata: { internalPaymentId: "victim-payment", planId: "plan-premium" },
  },
};

function forgedRequest() {
  return new Request(URL_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": ATTACKER_IP },
    body: JSON.stringify(FORGED_BODY),
  });
}

function assertNoBillingMutation() {
  expect(transaction).not.toHaveBeenCalled();
  expect(subUpdate).not.toHaveBeenCalled();
  expect(paymentUpdate).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.YOOKASSA_WEBHOOK_TOKEN = undefined;
  mockEnv.YOOKASSA_IP_ALLOWLIST_ENFORCED = false;
  mockEnv.TRUSTED_PROXY_HOPS = 1;
  mockEnv.TRUSTED_REAL_IP_HEADER = "";
  enqueue.mockResolvedValue(undefined);
  planPriceFindMany.mockResolvedValue([]);
});

describe("PAY-SEC-01 — allowlist OFF is safe because the payload is never trusted", () => {
  it("forged notification from a non-YooKassa IP is accepted at ingress (allowlist is log-only)", async () => {
    const res = await POST(forgedRequest());
    // Accepting is the DELIBERATE behaviour under this decision — the defence
    // is downstream, not at the door.
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("…but every attacker-controlled field is stripped before the queue", async () => {
    await POST(forgedRequest());

    const job = enqueue.mock.calls[0][0];
    expect(job.payload).toEqual({ event: "payment.succeeded", objectId: "yk-forged-001" });
    // Nothing an attacker could set survives ingress.
    const serialized = JSON.stringify(job.payload);
    expect(serialized).not.toContain("999999");
    expect(serialized).not.toContain("victim-payment");
    expect(serialized).not.toContain("plan-premium");
  });

  it("end-to-end: forged id unknown to the YooKassa API → ZERO billing mutation", async () => {
    // 1. Ingress accepts it (allowlist off, no token configured).
    await POST(forgedRequest());
    const { payload } = enqueue.mock.calls[0][0];

    // 2. The API has never heard of this payment id → 404 → null.
    getPayment.mockResolvedValue(null);
    await processYookassaWebhookPayload(payload);

    // 3. Nothing was written, and the DB was not even consulted.
    expect(paymentFindUnique).not.toHaveBeenCalled();
    assertNoBillingMutation();
  });

  it("end-to-end: real payment id, but the API says canceled → no activation", async () => {
    // The subtler forgery: replay a real id with a `succeeded` event while the
    // payment actually failed. The API-reported status must win.
    await POST(forgedRequest());
    const { payload } = enqueue.mock.calls[0][0];

    getPayment.mockResolvedValue({
      id: "yk-forged-001",
      status: "canceled",
      // The API's OWN metadata/amount — deliberately different from the body's.
      amount: { value: "1000.00", currency: "RUB" },
      metadata: {},
    });
    paymentFindUnique.mockResolvedValue({
      id: "pay-real",
      status: "PENDING",
      type: "INITIAL",
      periodMonths: 1,
      amountKopeks: 100_000,
      metadata: {},
      createdAt: new Date("2026-07-01T00:00:00Z"),
      subscriptionId: "sub-1",
      subscription: {
        id: "sub-1",
        userId: "u-1",
        scope: "MASTER",
        planId: "plan-free",
        status: "PENDING",
        periodMonths: 1,
        lastPaymentAt: null,
      },
    });

    await processYookassaWebhookPayload(payload);

    // No grant transaction and no subscription write at all (INITIAL + canceled).
    expect(transaction).not.toHaveBeenCalled();
    expect(subUpdate).not.toHaveBeenCalled();
    // The payment row is recorded as CANCELED — the real outcome, not the claim.
    expect(paymentUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "CANCELED" }) }),
    );
  });

  it("a configured URL token still rejects the forgery at the door (defence-in-depth)", async () => {
    // Independent of the allowlist: when the merchant sets a token, an attacker
    // who does not know it never reaches the queue at all.
    mockEnv.YOOKASSA_WEBHOOK_TOKEN = "prod-url-secret";

    const res = await POST(forgedRequest());

    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
    assertNoBillingMutation();
  });
});
