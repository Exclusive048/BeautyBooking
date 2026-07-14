import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildYandexAuthorizeUrl } from "@/lib/yandex/oauth";
import { generateCodeChallenge, generateCodeVerifier } from "@/lib/yandex/pkce";
import { yandexCallbackSchema } from "@/lib/yandex/schemas";

/**
 * FIX-YANDEX-OAUTH — unit coverage for the cleanly-testable surfaces:
 * authorize-URL construction (PKCE + state + endpoint/params), PKCE helpers,
 * and the callback schema. The account-linking branch (new-vs-existing user)
 * lives in the prisma-heavy callback route and mirrors api/auth/vk/callback
 * exactly — verified by code review (VK has no callback unit tests to mirror);
 * the live OAuth round-trip is a staging/deploy-ops item.
 */

describe("FIX-YANDEX-OAUTH — PKCE helpers", () => {
  it("generates a base64url verifier (no '=', '+', '/')", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).not.toMatch(/[=+/]/);
    expect(verifier.length).toBeGreaterThan(20);
  });

  it("challenge is deterministic for a given verifier and base64url-safe", () => {
    const verifier = "fixed-verifier-value";
    const a = generateCodeChallenge(verifier);
    const b = generateCodeChallenge(verifier);
    expect(a).toBe(b);
    expect(a).not.toMatch(/[=+/]/);
  });

  it("challenge differs from the verifier (it is the S256 hash)", () => {
    const verifier = generateCodeVerifier();
    expect(generateCodeChallenge(verifier)).not.toBe(verifier);
  });
});

describe("FIX-YANDEX-OAUTH — authorize URL", () => {
  const ORIGINAL = process.env.YANDEX_OAUTH_CLIENT_ID;

  beforeEach(() => {
    process.env.YANDEX_OAUTH_CLIENT_ID = "test-client-id";
  });
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.YANDEX_OAUTH_CLIENT_ID;
    else process.env.YANDEX_OAUTH_CLIENT_ID = ORIGINAL;
  });

  it("targets oauth.yandex.ru/authorize with the OAuth2 + PKCE params", () => {
    const url = new URL(
      buildYandexAuthorizeUrl({
        state: "state-123",
        codeChallenge: "challenge-abc",
        redirectUri: "https://example.test/api/auth/yandex/callback",
      })
    );
    expect(url.origin + url.pathname).toBe("https://oauth.yandex.ru/authorize");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://example.test/api/auth/yandex/callback"
    );
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  });

  it("throws a typed error when the client id is not configured", () => {
    delete process.env.YANDEX_OAUTH_CLIENT_ID;
    expect(() =>
      buildYandexAuthorizeUrl({ state: "s", codeChallenge: "c", redirectUri: "https://x/cb" })
    ).toThrowError(/client id is not configured/i);
  });
});

describe("FIX-YANDEX-OAUTH — callback schema", () => {
  it("parses a valid { code, state } callback", () => {
    const parsed = yandexCallbackSchema.safeParse({ code: "auth-code", state: "st" });
    expect(parsed.success).toBe(true);
  });

  it("rejects a missing/empty code or state", () => {
    expect(yandexCallbackSchema.safeParse({ code: "", state: "st" }).success).toBe(false);
    expect(yandexCallbackSchema.safeParse({ code: "c", state: "" }).success).toBe(false);
    expect(yandexCallbackSchema.safeParse({ state: "st" }).success).toBe(false);
  });
});
