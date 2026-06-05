import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./route";

/**
 * SECURITY-SURFACE-TESTS-A — TC-1 (TEST-COVERAGE-AUDIT-A finding).
 *
 * Locks the HMAC-SHA256 + length-check + timingSafeEqual behavior of
 * the YooKassa webhook signature verifier (invariant #5 — webhook
 * authenticity is the only thing standing between an attacker and
 * fake payment confirmations). Pure-helper test: known payload + known
 * secret → deterministic expected signature.
 *
 * Production callers consume `verifySignature` via the POST handler
 * in `route.ts` (line ~55); no other module imports it. These tests
 * are the only external consumers — kept here for co-location.
 */

const SECRET = "test-webhook-secret-do-not-use-in-prod";
const PAYLOAD = Buffer.from(
  JSON.stringify({ event: "payment.succeeded", object: { id: "test-pay-1" } }),
);
const VALID_SIGNATURE = crypto
  .createHmac("sha256", SECRET)
  .update(PAYLOAD)
  .digest("hex");

describe("yookassa webhook verifySignature", () => {
  it("accepts a valid HMAC-SHA256 signature", () => {
    expect(verifySignature(PAYLOAD, VALID_SIGNATURE, SECRET)).toBe(true);
  });

  it("rejects a tampered payload (signature was computed for original bytes)", () => {
    const tampered = Buffer.from(
      JSON.stringify({ event: "payment.succeeded", object: { id: "MUTATED" } }),
    );
    expect(verifySignature(tampered, VALID_SIGNATURE, SECRET)).toBe(false);
  });

  it("rejects a signature of the same length but wrong digest", () => {
    // Flip one hex char so length matches but content differs — exercises
    // the timingSafeEqual branch (not the length early-return).
    const wrong =
      VALID_SIGNATURE.slice(0, -1) + (VALID_SIGNATURE.endsWith("a") ? "b" : "a");
    expect(wrong).toHaveLength(VALID_SIGNATURE.length);
    expect(verifySignature(PAYLOAD, wrong, SECRET)).toBe(false);
  });

  it("rejects a signature of wrong length (length-mismatch early-return)", () => {
    // Truncated signature → expectedBuf.length !== providedBuf.length →
    // returns false BEFORE timingSafeEqual (which would throw on length mismatch).
    expect(verifySignature(PAYLOAD, VALID_SIGNATURE.slice(0, 32), SECRET)).toBe(false);
  });

  it("rejects an empty signature string", () => {
    expect(verifySignature(PAYLOAD, "", SECRET)).toBe(false);
  });

  it("rejects when the secret differs from the one used to sign", () => {
    expect(verifySignature(PAYLOAD, VALID_SIGNATURE, "wrong-secret")).toBe(false);
  });
});
