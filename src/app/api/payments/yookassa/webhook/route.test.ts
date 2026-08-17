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
  // HARDENING-08 FIX-17: IP allowlist enforce + trusted-proxy config read by the
  // route and by `@/lib/http/ip` (both import `@/lib/env`, which this mocks).
  YOOKASSA_IP_ALLOWLIST_ENFORCED: false as boolean,
  TRUSTED_PROXY_HOPS: 1 as number,
  TRUSTED_REAL_IP_HEADER: "" as string,
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
// SEC-20: частичный мок — сравнение настоящее, но видно, что зовут именно общий
// хелпер, а не локальную копию.
vi.mock("@/lib/auth/constant-time", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/constant-time")>();
  return { timingSafeStringEqual: vi.fn(actual.timingSafeStringEqual) };
});
// Partial-mock: keep real `withRequestId` / `getRequestId` (the route + `fail`
// helper use them), spy only on the log sinks to suppress real Telegram alerts.
vi.mock("@/lib/logging/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logging/logger")>();
  return { ...actual, logError: vi.fn(), logInfo: vi.fn() };
});

import { timingSafeStringEqual } from "@/lib/auth/constant-time";
import { POST } from "./route";

const URL_BASE = "http://localhost/api/payments/yookassa/webhook";

function makeRequest(opts: { token?: string | null; body: unknown; xff?: string }) {
  const url = opts.token != null ? `${URL_BASE}?token=${encodeURIComponent(opts.token)}` : URL_BASE;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.xff) headers["x-forwarded-for"] = opts.xff;
  return new Request(url, {
    method: "POST",
    headers,
    body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.YOOKASSA_WEBHOOK_TOKEN = "test-secret";
  mockEnv.NODE_ENV = "test";
  mockEnv.YOOKASSA_IP_ALLOWLIST_ENFORCED = false;
  mockEnv.TRUSTED_PROXY_HOPS = 1;
  mockEnv.TRUSTED_REAL_IP_HEADER = "";
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

describe("YooKassa webhook IP allowlist enforce (HARDENING-08 FIX-17)", () => {
  const LISTED_YOOKASSA_IP = "185.71.76.1"; // in 185.71.76.0/27
  const OUTSIDE_IP = "8.8.8.8";
  const VALID_BODY = { event: "payment.succeeded", object: { id: "yk-777" } };

  // The route captures `IP_ALLOWLIST_ENFORCED` at module load, so re-import a
  // fresh copy after flipping the env flag (the `enqueue` spy is a hoisted
  // singleton, so it survives the reset and still records calls).
  async function loadRouteWithEnforce(enforced: boolean) {
    vi.resetModules();
    mockEnv.YOOKASSA_IP_ALLOWLIST_ENFORCED = enforced;
    const mod = await import("./route");
    return mod.POST;
  }

  it("enforce ON + non-listed source IP → 403, nothing enqueued", async () => {
    const post = await loadRouteWithEnforce(true);
    const res = await post(makeRequest({ token: "test-secret", body: VALID_BODY, xff: OUTSIDE_IP }));
    expect(res.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("enforce ON + listed YooKassa source IP → 200, enqueued", async () => {
    const post = await loadRouteWithEnforce(true);
    const res = await post(
      makeRequest({ token: "test-secret", body: VALID_BODY, xff: LISTED_YOOKASSA_IP }),
    );
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("enforce OFF (default) + non-listed source IP → 200 (logged, NOT rejected)", async () => {
    const post = await loadRouteWithEnforce(false);
    const res = await post(makeRequest({ token: "test-secret", body: VALID_BODY, xff: OUTSIDE_IP }));
    expect(res.status).toBe(200);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("enforce ON ignores a forged leftmost XFF entry — a spoofed listed IP does NOT pass", async () => {
    const post = await loadRouteWithEnforce(true);
    // Attacker prepends a listed IP but the real (rightmost) hop is outside.
    const res = await post(
      makeRequest({
        token: "test-secret",
        body: VALID_BODY,
        xff: `${LISTED_YOOKASSA_IP}, ${OUTSIDE_IP}`,
      }),
    );
    expect(res.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });
});

/**
 * SEC-20 — роут нёс СОБСТВЕННУЮ копию constant-time-сравнения, и она начиналась
 * с `if (aBuf.length !== bBuf.length) return false`: длина секрета утекала по
 * времени ответа мимо самого сравнения. Правильная версия в проекте уже была —
 * `lib/auth/constant-time.ts` хеширует обе стороны до сравнения и потому от
 * длины не зависит; в её комментарии эта ловушка описана прямо.
 *
 * Тест пиннит именно использование общего хелпера: поведенчески «неверный токен
 * → 401» одинаково у обеих реализаций, поэтому отличить их можно только так.
 */
describe("SEC-20 — сравнение токена вебхука идёт через общий хелпер", () => {
  it("зовёт `timingSafeStringEqual` из `lib/auth/constant-time`", async () => {
    mockEnv.YOOKASSA_WEBHOOK_TOKEN = "test-secret";
    await POST(
      makeRequest({
        token: "test-secret",
        body: { event: "payment.succeeded", object: { id: "pay-1" } },
      }),
    );
    expect(timingSafeStringEqual).toHaveBeenCalledWith("test-secret", "test-secret");
  });

  it("отказ на токене ДРУГОЙ длины идёт тем же путём, без ранней ветки по длине", async () => {
    mockEnv.YOOKASSA_WEBHOOK_TOKEN = "test-secret";
    const res = await POST(
      makeRequest({
        token: "x",
        body: { event: "payment.succeeded", object: { id: "pay-1" } },
      }),
    );
    expect(res.status).toBe(401);
    // именно общий хелпер принял решение — локальная копия отсекла бы по длине
    expect(timingSafeStringEqual).toHaveBeenCalledWith("x", "test-secret");
    expect(enqueue).not.toHaveBeenCalled();
  });
});
