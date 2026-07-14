import { describe, it, expect, vi } from "vitest";

/**
 * AUTH-PROVIDER-ABSTRACTION-00 — CHARACTERIZATION (pins CURRENT behavior).
 *
 * VK CSRF/state protection rests on HMAC-signed `vk_id_state` + `vk_id_verifier`
 * cookies (sign = `value.HMAC-SHA256(value, AUTH_JWT_SECRET)`; read verifies the
 * signature constant-time and returns the raw value or null). This is the anchor
 * that makes the OAuth `state` unforgeable and the PKCE verifier tamper-proof —
 * a later provider-abstraction MUST preserve it. Pins: round-trip, tampered sig,
 * malformed cookie, wrong-value signature. Must stay green, unchanged.
 */

vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret" }, isProduction: false }));

import {
  signVkCookieValue,
  readSignedVkCookieValue,
  VK_ID_STATE_COOKIE,
  VK_ID_VERIFIER_COOKIE,
  VK_ID_STATE_TTL_SECONDS,
} from "@/lib/vk/cookies";

describe("VK cookie signing — CSRF/state integrity (characterization)", () => {
  it("round-trips a signed value", () => {
    const signed = signVkCookieValue("state-abc");
    expect(signed).toContain("."); // value.signature
    expect(readSignedVkCookieValue(signed)).toBe("state-abc");
  });

  it("returns null for a tampered signature", () => {
    const signed = signVkCookieValue("state-abc");
    const raw = signed.slice(0, signed.lastIndexOf("."));
    expect(readSignedVkCookieValue(`${raw}.deadbeef`)).toBeNull();
  });

  it("returns null when the value was swapped but the old signature kept", () => {
    const signed = signVkCookieValue("state-abc");
    const sig = signed.slice(signed.lastIndexOf(".") + 1);
    expect(readSignedVkCookieValue(`state-EVIL.${sig}`)).toBeNull();
  });

  it("returns null for a malformed cookie (no signature separator)", () => {
    expect(readSignedVkCookieValue("no-dot-here")).toBeNull();
  });

  it("returns null for empty / null / undefined input", () => {
    expect(readSignedVkCookieValue("")).toBeNull();
    expect(readSignedVkCookieValue(null)).toBeNull();
    expect(readSignedVkCookieValue(undefined)).toBeNull();
  });

  it("returns null for a value with a trailing dot but empty signature", () => {
    expect(readSignedVkCookieValue("state-abc.")).toBeNull();
  });

  it("pins the cookie names + TTL (contract other layers depend on)", () => {
    expect(VK_ID_STATE_COOKIE).toBe("vk_id_state");
    expect(VK_ID_VERIFIER_COOKIE).toBe("vk_id_verifier");
    expect(VK_ID_STATE_TTL_SECONDS).toBe(600);
  });
});
