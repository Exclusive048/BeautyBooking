import { describe, it, expect, vi, beforeEach } from "vitest";

const { claimLockMock, logErrorMock } = vi.hoisted(() => ({
  claimLockMock: vi.fn(),
  logErrorMock: vi.fn(),
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret" }, isProduction: false }));
vi.mock("@/lib/cache/cache", () => ({ claimLock: claimLockMock }));
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
    claimLockMock.mockReset();
    logErrorMock.mockReset();
  });

  it("first claim → true, replay of the same hash → false", async () => {
    claimLockMock
      .mockResolvedValueOnce({ status: "acquired" })
      .mockResolvedValueOnce({ status: "held" });
    expect(await claimTelegramAuthHash("hash-1")).toBe(true);
    expect(await claimTelegramAuthHash("hash-1")).toBe(false);
  });

  it("fails OPEN on a Redis outage (state cookie stays the primary defense)", async () => {
    // FIX-C11: обрыв приходит ТРЕТЬИМ состоянием, а не как `false`. Это и есть
    // предмет проверки: «недоступно» обязано вести к пропуску, а «занято» — к
    // отказу, и спутать их нельзя.
    claimLockMock.mockResolvedValueOnce({
      status: "unavailable",
      error: new Error("redis down"),
    });
    expect(await claimTelegramAuthHash("hash-2")).toBe(true);
    expect(logErrorMock).toHaveBeenCalledTimes(1);
  });

  it("🔴 «занято» и «недоступно» ведут к ПРОТИВОПОЛОЖНЫМ ответам", async () => {
    // Невакуумность предыдущего теста: если бы обе ветки давали `true`,
    // fail-open читался бы как работающий replay-guard.
    claimLockMock.mockResolvedValueOnce({ status: "held" });
    expect(await claimTelegramAuthHash("hash-3")).toBe(false);
    expect(logErrorMock).not.toHaveBeenCalled();
  });
});
