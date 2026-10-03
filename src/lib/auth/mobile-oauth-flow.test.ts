import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

/**
 * MOBILE-AUTH-A2 — кука мобильного OAuth-флоу и PKCE-сверка обмена.
 *
 * Кука решает, куда уйдёт колбэк: в приложение с кодом или в веб с куками
 * сессии. Поэтому `null` (= «флоу веб-овский») обязан выходить на ЛЮБОЙ
 * сомнительной куке: подделанной, от другого state, другого провайдера.
 */

vi.mock("@/lib/env", () => ({
  env: { AUTH_JWT_SECRET: "k".repeat(64) },
  isProduction: false,
  isVkAuthEnabled: true,
  isYandexAuthEnabled: true,
}));

import {
  matchesPkceS256Challenge,
  readMobileOAuthFlowCookieValue,
  signMobileOAuthFlowCookieValue,
  type MobileOAuthFlow,
} from "@/lib/auth/mobile-oauth-flow";

const VERIFIER = "verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
const CHALLENGE = createHash("sha256").update(VERIFIER).digest("base64url");

const FLOW: MobileOAuthFlow = { state: "state-1", provider: "vk", codeChallenge: CHALLENGE, linkUserId: null };

describe("кука мобильного флоу", () => {
  it("подписанная кука своего state и провайдера читается целиком", () => {
    const value = signMobileOAuthFlowCookieValue({ ...FLOW, linkUserId: "user-1" });
    expect(readMobileOAuthFlowCookieValue(value, "vk", "state-1")).toEqual({ ...FLOW, linkUserId: "user-1" });
  });

  it("другой state (брошенный мобильный флоу рядом с веб-входом) → null", () => {
    const value = signMobileOAuthFlowCookieValue(FLOW);
    expect(readMobileOAuthFlowCookieValue(value, "vk", "state-2")).toBeNull();
    expect(readMobileOAuthFlowCookieValue(value, "vk", null)).toBeNull();
  });

  it("другой провайдер → null", () => {
    const value = signMobileOAuthFlowCookieValue(FLOW);
    expect(readMobileOAuthFlowCookieValue(value, "yandex", "state-1")).toBeNull();
  });

  it("подмена полезной нагрузки или подписи → null", () => {
    const value = signMobileOAuthFlowCookieValue(FLOW);
    const [, signature] = value.split(".");
    const forgedPayload = Buffer.from(
      JSON.stringify({ s: "state-1", p: "vk", c: CHALLENGE, u: "victim" }),
    ).toString("base64url");
    expect(readMobileOAuthFlowCookieValue(`${forgedPayload}.${signature}`, "vk", "state-1")).toBeNull();
    expect(readMobileOAuthFlowCookieValue(`${value}x`, "vk", "state-1")).toBeNull();
    expect(readMobileOAuthFlowCookieValue("garbage", "vk", "state-1")).toBeNull();
    expect(readMobileOAuthFlowCookieValue(undefined, "vk", "state-1")).toBeNull();
  });
});

describe("matchesPkceS256Challenge", () => {
  it("верный verifier совпадает", () => {
    expect(matchesPkceS256Challenge(VERIFIER, CHALLENGE)).toBe(true);
  });

  it("чужой, короткий или не того алфавита — нет", () => {
    expect(matchesPkceS256Challenge(`${VERIFIER}x`, CHALLENGE)).toBe(false);
    expect(matchesPkceS256Challenge("short", createHash("sha256").update("short").digest("base64url"))).toBe(false);
    const spaced = `${"a".repeat(42)} `;
    expect(matchesPkceS256Challenge(spaced, createHash("sha256").update(spaced).digest("base64url"))).toBe(false);
    expect(matchesPkceS256Challenge(VERIFIER, "")).toBe(false);
  });
});
