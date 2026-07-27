import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SECURITY-EXPOSURE-AUDIT-01 · Y9 — the OAuth callback error boundary must not
 * leak provider payloads (access_token / refresh_token / profile) to the client,
 * and must log only a scrubbed view server-side. Uses the REAL scrubRecord so
 * the redaction is exercised, not stubbed.
 */

const failSpy = vi.hoisted(() => vi.fn((message: string, status: number, code?: string, details?: unknown) => ({ message, status, code, details })));
const logErrorSpy = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/response", () => ({ fail: failSpy }));
vi.mock("@/lib/logging/logger", () => ({
  logError: logErrorSpy,
  getRequestId: () => "req-1",
}));

import { AppError } from "@/lib/api/errors";
import { failOAuthCallback } from "@/lib/auth/oauth-callback-error";

const req = new Request("http://localhost/api/auth/vk/callback");

beforeEach(() => {
  failSpy.mockClear();
  logErrorSpy.mockClear();
});

describe("failOAuthCallback", () => {
  it("never forwards AppError.details to the client (fail called with no details)", () => {
    const err = new AppError("VK ID token response is incomplete", 502, "VK_ID_OAUTH_FAILED", {
      access_token: "vk1.a.SUPER_SECRET_ACCESS_TOKEN_value",
      refresh_token: "vk1.r.SECRET_REFRESH",
      user: { first_name: "Иван", last_name: "Петров" },
    });
    failOAuthCallback(req, err);

    expect(failSpy).toHaveBeenCalledTimes(1);
    const args = failSpy.mock.calls[0];
    // (message, status, code) only — the 4th arg (details) must be absent.
    expect(args.length).toBe(3);
    expect(args[3]).toBeUndefined();
    expect(args[0]).toBe("VK ID token response is incomplete");
    expect(args[2]).toBe("VK_ID_OAUTH_FAILED");
  });

  it("logs a SCRUBBED view — the raw token and profile never appear in logs", () => {
    const err = new AppError("VK ID profile request failed", 502, "VK_ID_PROFILE_FAILED", {
      access_token: "vk1.a.SUPER_SECRET_ACCESS_TOKEN_value",
      user: { first_name: "Иван", last_name: "Петров" },
    });
    failOAuthCallback(req, err);

    expect(logErrorSpy).toHaveBeenCalledTimes(1);
    const serialized = JSON.stringify(logErrorSpy.mock.calls[0][1]);
    expect(serialized).not.toContain("SUPER_SECRET_ACCESS_TOKEN_value");
    expect(serialized).not.toContain("SECRET_REFRESH");
    expect(serialized).not.toContain("Иван");
    // The code/status are still logged for triage.
    expect(serialized).toContain("VK_ID_PROFILE_FAILED");
  });

  it("handles a non-AppError and details-less error without crashing", () => {
    failOAuthCallback(req, new Error("network boom"));
    expect(failSpy).toHaveBeenCalledTimes(1);
    expect(failSpy.mock.calls[0].length).toBe(3);
  });
});
