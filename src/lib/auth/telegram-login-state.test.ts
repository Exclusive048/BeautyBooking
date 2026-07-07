import { describe, it, expect, vi, beforeEach } from "vitest";

const { setNxMock, logErrorMock } = vi.hoisted(() => ({
  setNxMock: vi.fn(),
  logErrorMock: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret" }, isProduction: false }));
vi.mock("@/lib/cache/cache", () => ({ setNx: setNxMock }));
vi.mock("@/lib/logging/logger", () => ({ logError: logErrorMock }));

import {
  claimTelegramAuthHash,
  createTelegramLoginState,
  verifyTelegramLoginState,
} from "@/lib/auth/telegram-login-state";

describe("telegram-login-state — HARDENING-06 FIX-9 (browser-binding)", () => {
  it("createTelegramLoginState → verify roundtrip succeeds", () => {
    const { state, cookieValue } = createTelegramLoginState();
    expect(verifyTelegramLoginState(cookieValue, state)).toBe(true);
  });

  it("rejects a missing cookie (no browser-bound flow)", () => {
    const { state } = createTelegramLoginState();
    expect(verifyTelegramLoginState(undefined, state)).toBe(false);
    expect(verifyTelegramLoginState(null, state)).toBe(false);
    expect(verifyTelegramLoginState("", state)).toBe(false);
  });

  it("rejects a missing state param", () => {
    const { cookieValue } = createTelegramLoginState();
    expect(verifyTelegramLoginState(cookieValue, undefined)).toBe(false);
    expect(verifyTelegramLoginState(cookieValue, "")).toBe(false);
  });

  it("🔴 rejects a mismatched state (the forced-login vector — victim's browser lacks the attacker's nonce)", () => {
    const attacker = createTelegramLoginState();
    const victim = createTelegramLoginState();
    expect(verifyTelegramLoginState(attacker.cookieValue, victim.state)).toBe(false);
    expect(verifyTelegramLoginState(victim.cookieValue, attacker.state)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const { state, cookieValue } = createTelegramLoginState();
    const raw = cookieValue.slice(0, cookieValue.lastIndexOf("."));
    expect(verifyTelegramLoginState(`${raw}.deadbeef`, state)).toBe(false);
  });

  it("rejects a malformed cookie (no signature separator)", () => {
    const { state } = createTelegramLoginState();
    expect(verifyTelegramLoginState(state, state)).toBe(false);
  });

  it("rejects a forged cookie whose nonce the attacker chose (invalid signature)", () => {
    expect(verifyTelegramLoginState("attacker-nonce.badsig", "attacker-nonce")).toBe(false);
  });
});

describe("claimTelegramAuthHash — single-use replay guard", () => {
  beforeEach(() => {
    setNxMock.mockReset();
    logErrorMock.mockReset();
  });

  it("first claim → true, replay of the same hash → false", async () => {
    setNxMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    expect(await claimTelegramAuthHash("hash-1")).toBe(true);
    expect(await claimTelegramAuthHash("hash-1")).toBe(false);
  });

  it("fails OPEN on a Redis outage (state cookie stays the primary defense)", async () => {
    setNxMock.mockRejectedValueOnce(new Error("redis down"));
    expect(await claimTelegramAuthHash("hash-2")).toBe(true);
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });
});
