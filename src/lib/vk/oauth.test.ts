import { describe, it, expect, vi } from "vitest";

/**
 * AUTH-PROVIDER-ABSTRACTION-00 — CHARACTERIZATION (pins CURRENT behavior).
 *
 * VK had ZERO OAuth-lib coverage. This pins the cleanly-testable VK surfaces the
 * abstraction must not silently change: the authorize-URL params (incl. PKCE
 * S256 + `scope=email phone`), the login-vs-integration redirect-URI rewrite
 * (`buildRedirectUri`/`requireVkRedirectUri` — a VK-specific quirk), and the
 * PKCE helpers. Token/profile fetches (network) + the inline callback
 * account-linking/409 branch are NOT covered here — see the Phase-0 report
 * (they need a Phase-1 extraction/route-harness). `@/lib/vk/config` is mocked so
 * the tests are deterministic without env-load timing.
 */

vi.mock("@/lib/vk/config", () => ({
  getVkClientId: vi.fn(() => "test-vk-client"),
  getVkClientSecret: vi.fn(() => "test-vk-secret"),
  getVkRedirectUri: vi.fn(() => "https://example.test/api/auth/vk/callback"),
}));

import { buildVkAuthorizeUrl, requireVkRedirectUri } from "@/lib/vk/oauth";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/vk/pkce";

describe("buildVkAuthorizeUrl — authorize params (characterization)", () => {
  it("targets id.vk.ru/authorize with OAuth2 + PKCE(S256) + scope params", () => {
    const url = new URL(
      buildVkAuthorizeUrl({
        state: "state-123",
        codeChallenge: "challenge-abc",
        redirectUri: "https://example.test/api/auth/vk/callback",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://id.vk.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-vk-client");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.test/api/auth/vk/callback",
    );
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("email phone");
  });
});

describe("requireVkRedirectUri — login vs integration path rewrite (VK-specific quirk)", () => {
  it('mode "auth" keeps the /api/auth/vk/callback path', () => {
    expect(requireVkRedirectUri("auth")).toBe("https://example.test/api/auth/vk/callback");
  });

  it('mode "integrations" rewrites to /api/integrations/vk/callback', () => {
    expect(requireVkRedirectUri("integrations")).toBe(
      "https://example.test/api/integrations/vk/callback",
    );
  });
});

describe("VK PKCE helpers (characterization)", () => {
  it("verifier is base64url (no '=', '+', '/')", () => {
    expect(generateCodeVerifier()).not.toMatch(/[=+/]/);
  });

  it("challenge is the deterministic S256 hash of the verifier, base64url-safe", () => {
    const verifier = "fixed-verifier";
    const a = generateCodeChallenge(verifier);
    const b = generateCodeChallenge(verifier);
    expect(a).toBe(b);
    expect(a).not.toBe(verifier);
    expect(a).not.toMatch(/[=+/]/);
  });
});
