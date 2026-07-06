import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * HARDENING-02 — webhook route gates. YooKassa doesn't sign notifications, so
 * the route does two cheap pre-filters (optional URL `?token=`, log-only IP
 * allowlist) and enqueues ONLY `{ event, objectId }`; the worker's API re-fetch
 * is the authenticity anchor.
 */

const mockEnv = vi.hoisted(() => ({
  YOOKASSA_WEBHOOK_TOKEN: "test-secret" as string | undefined,
  NODE_ENV: "test" as string,
}));
const enqueue = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ env: mockEnv }));
vi.mock("@/lib/queue/queue", () => ({ enqueue }));
vi.mock("@/lib/monitoring", () => ({ alertCritical: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/monitoring/api-alerts", () => ({
  alertWebhookFailure: vi.fn(),
  // `fail(...)` (status ≥ 500) calls this.
  track5xxError: vi.fn(),
}));
vi.mock("@/lib/monitoring/status", () => ({ recordSurfaceEvent: vi.fn() }));
// Partial-mock: keep real `withRequestId` / `getRequestId` (the route + `fail`
// helper use them), spy only on the log sinks to suppress real Telegram alerts.
vi.mock("@/lib/logging/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logging/logger")>();
  return { ...actual, logError: vi.fn(), logInfo: vi.fn() };
});

import { POST } from "./route";

const URL_BASE = "http://localhost/api/payments/yookassa/webhook";

function makeRequest(opts: { token?: string | null; body: unknown }) {
  const url = opts.token != null ? `${URL_BASE}?token=${encodeURIComponent(opts.token)}` : URL_BASE;
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.YOOKASSA_WEBHOOK_TOKEN = "test-secret";
  mockEnv.NODE_ENV = "test";
  enqueue.mockResolvedValue(undefined);
});

describe("YooKassa webhook route (HARDENING-02)", () => {
  it("valid body + correct token → 200 and enqueues { event, objectId }", async () => {
    const res = await POST(
      makeRequest({
        token: "test-secret",
        body: { type: "notification", event: "payment.succeeded", object: { id: "yk-123" } },
      }),
    );

    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
    const job = enqueue.mock.calls[0][0];
    expect(job.type).toBe("yookassa.webhook");
    expect(job.payload).toEqual({ event: "payment.succeeded", objectId: "yk-123" });
  });

  it("wrong token → 401, nothing enqueued", async () => {
    const res = await POST(
      makeRequest({
        token: "wrong",
        body: { event: "payment.succeeded", object: { id: "yk-123" } },
      }),
    );

    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("missing token when one is configured → 401", async () => {
    const res = await POST(
      makeRequest({ body: { event: "payment.succeeded", object: { id: "yk-123" } } }),
    );
    expect(res.status).toBe(401);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("no token configured → accepts (re-fetch anchor still applies)", async () => {
    mockEnv.YOOKASSA_WEBHOOK_TOKEN = undefined;
    const res = await POST(
      makeRequest({ body: { event: "payment.succeeded", object: { id: "yk-123" } } }),
    );
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("tampered body: extra fields do NOT reach the queue (only event + object.id)", async () => {
    await POST(
      makeRequest({
        token: "test-secret",
        body: {
          event: "payment.succeeded",
          object: {
            id: "yk-123",
            status: "succeeded", // attacker-controlled — must be ignored
            amount: { value: "999999.00", currency: "RUB" },
            metadata: { internalPaymentId: "evil" },
          },
        },
      }),
    );

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0][0].payload).toEqual({
      event: "payment.succeeded",
      objectId: "yk-123",
    });
  });

  it("enqueue failure → 503 so YooKassa retries", async () => {
    enqueue.mockRejectedValue(new Error("redis down"));
    const res = await POST(
      makeRequest({
        token: "test-secret",
        body: { event: "payment.succeeded", object: { id: "yk-123" } },
      }),
    );
    expect(res.status).toBe(503);
  });

  it("malformed body (missing object.id) → 400", async () => {
    const res = await POST(
      makeRequest({ token: "test-secret", body: { event: "payment.succeeded", object: {} } }),
    );
    expect(res.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
