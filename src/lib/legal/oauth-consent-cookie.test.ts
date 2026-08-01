import { describe, it, expect, vi } from "vitest";

/**
 * RKN-FIX-01 — the OAuth consent cookie must be as hard to forge as the CSRF
 * state it rides with, because it is what the callback trusts when deciding
 * whether an account may be created.
 */

vi.mock("@/lib/env", () => ({ env: { AUTH_JWT_SECRET: "x".repeat(64) } }));

import {
  signConsentCookieValue,
  readConsentCookieValue,
} from "@/lib/legal/oauth-consent-cookie";
import { EMPTY_CONSENT_FLAGS, type ConsentFlags } from "@/lib/legal/consent-flags";

const STATE = "a".repeat(64);
const ALL: ConsentFlags = { terms: true, pdProcessing: true, marketing: true };
const REQUIRED_ONLY: ConsentFlags = { terms: true, pdProcessing: true, marketing: false };

describe("oauth consent cookie", () => {
  it("round-trips the ticked purposes for the flow it was minted for", () => {
    expect(readConsentCookieValue(signConsentCookieValue(STATE, ALL), STATE)).toEqual(ALL);
    expect(readConsentCookieValue(signConsentCookieValue(STATE, REQUIRED_ONLY), STATE)).toEqual(
      REQUIRED_ONLY,
    );
    expect(
      readConsentCookieValue(signConsentCookieValue(STATE, EMPTY_CONSENT_FLAGS), STATE),
    ).toEqual(EMPTY_CONSENT_FLAGS);
  });

  it("rejects a cookie minted for a DIFFERENT flow (no cross-flow replay)", () => {
    const cookie = signConsentCookieValue(STATE, ALL);
    expect(readConsentCookieValue(cookie, "b".repeat(64))).toBeNull();
  });

  it("rejects a tampered payload — upgrading the flags invalidates the signature", () => {
    const cookie = signConsentCookieValue(STATE, EMPTY_CONSENT_FLAGS);
    const [payload, signature] = [cookie.slice(0, cookie.lastIndexOf(".")), cookie.slice(cookie.lastIndexOf(".") + 1)];
    const forged = `${payload}tpm.${signature}`;
    expect(readConsentCookieValue(forged, STATE)).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const cookie = signConsentCookieValue(STATE, ALL);
    expect(readConsentCookieValue(`${cookie}x`, STATE)).toBeNull();
  });

  it("treats missing / malformed cookies as no-consent, never as consent", () => {
    expect(readConsentCookieValue(undefined, STATE)).toBeNull();
    expect(readConsentCookieValue("", STATE)).toBeNull();
    expect(readConsentCookieValue("no-signature", STATE)).toBeNull();
    expect(readConsentCookieValue(".sig", STATE)).toBeNull();
  });

});
