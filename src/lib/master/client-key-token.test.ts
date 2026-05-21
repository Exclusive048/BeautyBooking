import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  signClientKeyToken,
  verifyClientKeyToken,
} from "@/lib/master/client-key-token";

/**
 * MASTER-CLIENTS-FIX-A #7а — pinning the HMAC token contract used to
 * hide raw client keys from the «Вся история» URL.
 *
 * Same pattern as CHAT-FOUNDATION's `chat-attachment-token.test.ts`:
 * roundtrip, master-scope rejection, expired token, tampered signature,
 * cross-purpose replay, malformed input. Specifically asserts the token
 * NEVER contains the raw `clientKey` substring — that's the privacy
 * leak the fix exists to close.
 */

const ORIGINAL_SECRET = process.env.AUTH_JWT_SECRET;

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret-master-clients-fix-a";
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.AUTH_JWT_SECRET;
  } else {
    process.env.AUTH_JWT_SECRET = ORIGINAL_SECRET;
  }
});

const MASTER = "prov_abc123";
const CLIENT_KEY = "user:cmpa987xyz";

describe("signClientKeyToken / verifyClientKeyToken — roundtrip", () => {
  it("signs and verifies the same clientKey within the same master scope", () => {
    const token = signClientKeyToken({ clientKey: CLIENT_KEY, masterProviderId: MASTER });
    const verified = verifyClientKeyToken({ token, masterProviderId: MASTER });
    expect(verified).toBe(CLIENT_KEY);
  });

  it("supports phone-style keys", () => {
    const token = signClientKeyToken({
      clientKey: "phone:+79991112233",
      masterProviderId: MASTER,
    });
    expect(verifyClientKeyToken({ token, masterProviderId: MASTER })).toBe("phone:+79991112233");
  });
});

describe("signClientKeyToken — URL privacy", () => {
  it("token does NOT contain the raw clientKey substring", () => {
    // The whole point of the fix: cuid must not leak into URLs. The
    // signed payload is base64url-encoded JSON, so the literal `cuid`
    // bytes shouldn't appear in any form.
    const token = signClientKeyToken({ clientKey: CLIENT_KEY, masterProviderId: MASTER });
    expect(token.includes(CLIENT_KEY)).toBe(false);
    expect(token.includes("cmpa987xyz")).toBe(false);
  });

  it("token does NOT contain the masterProviderId substring", () => {
    const token = signClientKeyToken({ clientKey: CLIENT_KEY, masterProviderId: MASTER });
    expect(token.includes(MASTER)).toBe(false);
  });
});

describe("verifyClientKeyToken — rejections", () => {
  it("rejects a token signed for a different master", () => {
    const token = signClientKeyToken({ clientKey: CLIENT_KEY, masterProviderId: MASTER });
    expect(
      verifyClientKeyToken({ token, masterProviderId: "prov_otherMaster" }),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const baseNow = 1_000_000_000;
    const token = signClientKeyToken({
      clientKey: CLIENT_KEY,
      masterProviderId: MASTER,
      nowSeconds: baseNow,
    });
    // 25h later — past the 24h TTL
    expect(
      verifyClientKeyToken({
        token,
        masterProviderId: MASTER,
        nowSeconds: baseNow + 60 * 60 * 25,
      }),
    ).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signClientKeyToken({ clientKey: CLIENT_KEY, masterProviderId: MASTER });
    const parts = token.split(".");
    const tampered = `${parts[0]}.AAAAAA`;
    expect(verifyClientKeyToken({ token: tampered, masterProviderId: MASTER })).toBeNull();
  });

  it("rejects a tampered body (signature mismatch)", () => {
    const token = signClientKeyToken({ clientKey: CLIENT_KEY, masterProviderId: MASTER });
    const parts = token.split(".");
    const tamperedBody = `${parts[0]}xxxx.${parts[1]}`;
    expect(verifyClientKeyToken({ token: tamperedBody, masterProviderId: MASTER })).toBeNull();
  });

  it("rejects malformed token (no separator)", () => {
    expect(verifyClientKeyToken({ token: "garbage", masterProviderId: MASTER })).toBeNull();
  });

  it("rejects empty token", () => {
    expect(verifyClientKeyToken({ token: "", masterProviderId: MASTER })).toBeNull();
  });

  it("rejects token whose payload purpose differs (cross-replay guard)", () => {
    // Construct a token signed with a different purpose claim. Even with
    // a correct HMAC body, the verifier must reject it — defends against
    // mixing tokens between surfaces (chat-attachment vs history-filter).
    const body = Buffer.from(
      JSON.stringify({
        k: CLIENT_KEY,
        p: MASTER,
        exp: Math.floor(Date.now() / 1000) + 3600,
        purpose: "something-else",
      }),
    )
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const sig = crypto
      .createHmac("sha256", process.env.AUTH_JWT_SECRET!)
      .update(body)
      .digest("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    const token = `${body}.${sig}`;
    expect(verifyClientKeyToken({ token, masterProviderId: MASTER })).toBeNull();
  });
});
