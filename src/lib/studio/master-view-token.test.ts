import crypto from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  signStudioMasterViewToken,
  verifyStudioMasterViewToken,
} from "@/lib/studio/master-view-token";

/**
 * STUDIO-MASTERS-PRIVACY-FIX-A — pinning the HMAC token contract used to
 * hide raw master cuids from studio-master deep-links («Расписание
 * мастера» / «В календарь»).
 *
 * Mirrors the CLIENTS-FIX-A `client-key-token.test.ts` structure
 * point-for-point (third application of the pattern). Roundtrip,
 * cross-scope rejection, expired token, tampered signature, malformed
 * input, cross-purpose replay. Specifically asserts the token NEVER
 * contains the raw master id substring — that's the leak the fix
 * exists to close.
 */

const ORIGINAL_SECRET = process.env.AUTH_JWT_SECRET;

beforeAll(() => {
  process.env.AUTH_JWT_SECRET = "test-secret-studio-masters-privacy-fix-a";
});

afterAll(() => {
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.AUTH_JWT_SECRET;
  } else {
    process.env.AUTH_JWT_SECRET = ORIGINAL_SECRET;
  }
});

const STUDIO = "studio_abc123";
const MASTER = "cmpa987xyz";

describe("signStudioMasterViewToken / verifyStudioMasterViewToken — roundtrip", () => {
  it("signs and verifies the same masterId within the same studio scope", () => {
    const token = signStudioMasterViewToken({ masterId: MASTER, studioId: STUDIO });
    const verified = verifyStudioMasterViewToken({ token, studioId: STUDIO });
    expect(verified).toBe(MASTER);
  });

  it("supports realistic prisma cuid strings", () => {
    const cuid = "clr3k7g4j0000abcdmaster99";
    const token = signStudioMasterViewToken({ masterId: cuid, studioId: STUDIO });
    expect(verifyStudioMasterViewToken({ token, studioId: STUDIO })).toBe(cuid);
  });
});

describe("signStudioMasterViewToken — URL privacy", () => {
  it("token does NOT contain the raw masterId substring", () => {
    // The whole point of the fix: master cuid must not leak into URLs.
    // The signed payload is base64url-encoded JSON, so the literal cuid
    // bytes must not appear in any form.
    const token = signStudioMasterViewToken({ masterId: MASTER, studioId: STUDIO });
    expect(token.includes(MASTER)).toBe(false);
    expect(token.includes("cmpa987xyz")).toBe(false);
  });

  it("token does NOT contain the studioId substring", () => {
    const token = signStudioMasterViewToken({ masterId: MASTER, studioId: STUDIO });
    expect(token.includes(STUDIO)).toBe(false);
  });
});

describe("verifyStudioMasterViewToken — rejections", () => {
  it("rejects a token signed for a different studio (cross-studio defence)", () => {
    const token = signStudioMasterViewToken({ masterId: MASTER, studioId: STUDIO });
    expect(
      verifyStudioMasterViewToken({ token, studioId: "studio_otherStudio" }),
    ).toBeNull();
  });

  it("rejects an expired token", () => {
    const baseNow = 1_000_000_000;
    const token = signStudioMasterViewToken({
      masterId: MASTER,
      studioId: STUDIO,
      nowSeconds: baseNow,
    });
    // 25h later — past the 24h TTL
    expect(
      verifyStudioMasterViewToken({
        token,
        studioId: STUDIO,
        nowSeconds: baseNow + 60 * 60 * 25,
      }),
    ).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = signStudioMasterViewToken({ masterId: MASTER, studioId: STUDIO });
    const parts = token.split(".");
    const tampered = `${parts[0]}.AAAAAA`;
    expect(verifyStudioMasterViewToken({ token: tampered, studioId: STUDIO })).toBeNull();
  });

  it("rejects a tampered body (signature mismatch)", () => {
    const token = signStudioMasterViewToken({ masterId: MASTER, studioId: STUDIO });
    const parts = token.split(".");
    const tamperedBody = `${parts[0]}xxxx.${parts[1]}`;
    expect(verifyStudioMasterViewToken({ token: tamperedBody, studioId: STUDIO })).toBeNull();
  });

  it("rejects malformed token (no separator)", () => {
    expect(verifyStudioMasterViewToken({ token: "garbage", studioId: STUDIO })).toBeNull();
  });

  it("rejects empty token", () => {
    expect(verifyStudioMasterViewToken({ token: "", studioId: STUDIO })).toBeNull();
  });

  it("rejects token whose payload purpose differs (cross-replay guard)", () => {
    // Construct a token with a foreign purpose claim (e.g. a
    // client-history token re-encoded). Even with a valid signature
    // for that purpose, the verifier must reject it. Defends against
    // mixing tokens across surfaces (chat-attachment / client-history
    // / studio-master-view).
    const body = Buffer.from(
      JSON.stringify({
        mid: MASTER,
        sid: STUDIO,
        exp: Math.floor(Date.now() / 1000) + 3600,
        purpose: "client-history-filter", // foreign purpose from MASTER-CLIENTS-FIX-A
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
    expect(verifyStudioMasterViewToken({ token, studioId: STUDIO })).toBeNull();
  });
});
