import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · Y2 — pins the rate-limit polarity so it cannot
 * silently invert again. The legacy `checkRateLimit(key, limit, window)`
 * overload returns `true` = ALLOWED; the route previously treated that as
 * `isLimited`, so it 429'd the first 20 reports/min and accepted everything
 * past the limit. These tests assert the corrected direction:
 *   allowed (true)  → 200 (report is logged)
 *   limited (false) → 429
 */

const checkRateLimit = vi.hoisted(() => vi.fn());
const logError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rate-limit", () => ({ checkRateLimit }));
vi.mock("@/lib/http/ip", () => ({ getClientIp: () => "1.2.3.4" }));
// Partial mock: keep the real `getRequestId` (used by the `fail()` helper) and
// only spy on `logError` so we can assert whether the report was recorded.
vi.mock("@/lib/logging/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/logging/logger")>();
  return { ...actual, logError };
});
vi.mock("@/lib/monitoring/api-alerts", () => ({ track5xxError: vi.fn() }));

import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/log-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/log-error rate-limit polarity", () => {
  it("accepts and logs the report when the limiter ALLOWS (true)", async () => {
    checkRateLimit.mockResolvedValue(true);
    const res = await POST(makeRequest({ message: "boom", url: "/x" }));
    expect(res.status).toBe(200);
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("rejects with 429 when the limiter LIMITS (false)", async () => {
    checkRateLimit.mockResolvedValue(false);
    const res = await POST(makeRequest({ message: "boom", url: "/x" }));
    expect(res.status).toBe(429);
    // The report must NOT be logged once the limit is hit.
    expect(logError).not.toHaveBeenCalled();
  });

  it("passes the legacy (key, limit, window) triple, not a config object", async () => {
    checkRateLimit.mockResolvedValue(true);
    await POST(makeRequest({ message: "boom" }));
    const [key, limit, windowSeconds] = checkRateLimit.mock.calls[0];
    expect(key).toBe("log-error:1.2.3.4");
    expect(typeof limit).toBe("number");
    expect(typeof windowSeconds).toBe("number");
  });
});
