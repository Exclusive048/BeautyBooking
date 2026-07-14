import { describe, it, expect, vi } from "vitest";

/**
 * AUTH-PROVIDER-ABSTRACTION-00 — CHARACTERIZATION (pins CURRENT behavior).
 *
 * Yandex CSRF/state protection is a bespoke-parallel of VK's: HMAC-signed
 * `yandex_oauth_state` + `yandex_oauth_verifier` cookies over AUTH_JWT_SECRET.
 * Pins the same integrity contract (round-trip / tamper / malformed) so a later
 * provider-abstraction preserves it. Must stay green, unchanged.
 */

vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "test-secret" }, isProduction: false }));

import {
  signYandexCookieValue,
  readSignedYandexCookieValue,
  YANDEX_STATE_COOKIE,
  YANDEX_VERIFIER_COOKIE,
  YANDEX_STATE_TTL_SECONDS,
} from "@/lib/yandex/cookies";

describe("Yandex cookie signing — CSRF/state integrity (characterization)", () => {
  it("round-trips a signed value", () => {
    const signed = signYandexCookieValue("state-xyz");
    expect(signed).toContain(".");
    expect(readSignedYandexCookieValue(signed)).toBe("state-xyz");
  });

  it("returns null for a tampered signature", () => {
    const signed = signYandexCookieValue("state-xyz");
    const raw = signed.slice(0, signed.lastIndexOf("."));
    expect(readSignedYandexCookieValue(`${raw}.deadbeef`)).toBeNull();
  });

  it("returns null when the value was swapped but the old signature kept", () => {
    const signed = signYandexCookieValue("state-xyz");
    const sig = signed.slice(signed.lastIndexOf(".") + 1);
    expect(readSignedYandexCookieValue(`state-EVIL.${sig}`)).toBeNull();
  });

  it("returns null for malformed / empty / null / undefined input", () => {
    expect(readSignedYandexCookieValue("no-dot-here")).toBeNull();
    expect(readSignedYandexCookieValue("state-xyz.")).toBeNull();
    expect(readSignedYandexCookieValue("")).toBeNull();
    expect(readSignedYandexCookieValue(null)).toBeNull();
    expect(readSignedYandexCookieValue(undefined)).toBeNull();
  });

  it("pins the cookie names + TTL", () => {
    expect(YANDEX_STATE_COOKIE).toBe("yandex_oauth_state");
    expect(YANDEX_VERIFIER_COOKIE).toBe("yandex_oauth_verifier");
    expect(YANDEX_STATE_TTL_SECONDS).toBe(600);
  });
});
