import { describe, it, expect } from "vitest";
import {
  consentFlagsFromParams,
  consentFlagsSchema,
  consentFlagsToQuery,
  hasRequiredConsents,
  parseConsentFlags,
  serializeConsentFlags,
  EMPTY_CONSENT_FLAGS,
} from "@/lib/legal/consent-flags";

/**
 * RKN-FIX-01 — the flag contract shared by the login form, the OTP routes and
 * the OAuth cookie. Everything here guards the same rule: nothing may read as
 * "granted" unless it was explicitly granted.
 */

describe("consent flags — required vs optional", () => {
  it("requires BOTH the offer and the PD-processing consent", () => {
    expect(hasRequiredConsents({ terms: true, pdProcessing: true, marketing: false })).toBe(true);
    expect(hasRequiredConsents({ terms: true, pdProcessing: false, marketing: true })).toBe(false);
    expect(hasRequiredConsents({ terms: false, pdProcessing: true, marketing: true })).toBe(false);
    expect(hasRequiredConsents(EMPTY_CONSENT_FLAGS)).toBe(false);
    expect(hasRequiredConsents(null)).toBe(false);
    expect(hasRequiredConsents(undefined)).toBe(false);
  });

  it("marketing never contributes to the required set (optional by law)", () => {
    expect(hasRequiredConsents({ terms: true, pdProcessing: true, marketing: false })).toBe(
      hasRequiredConsents({ terms: true, pdProcessing: true, marketing: true }),
    );
  });

  it("defaults marketing to false when a client omits it", () => {
    const parsed = consentFlagsSchema.parse({ terms: true, pdProcessing: true });
    expect(parsed.marketing).toBe(false);
  });

  it("rejects non-boolean flags instead of coercing them", () => {
    expect(consentFlagsSchema.safeParse({ terms: "true", pdProcessing: true }).success).toBe(false);
    expect(consentFlagsSchema.safeParse({ terms: 1, pdProcessing: 1 }).success).toBe(false);
  });
});

describe("consent flags — serialisation", () => {
  it("round-trips through the compact cookie form", () => {
    const cases = [
      EMPTY_CONSENT_FLAGS,
      { terms: true, pdProcessing: false, marketing: false },
      { terms: true, pdProcessing: true, marketing: false },
      { terms: true, pdProcessing: true, marketing: true },
    ];
    for (const flags of cases) {
      expect(parseConsentFlags(serializeConsentFlags(flags))).toEqual(flags);
    }
  });

  it("rejects an unknown purpose letter rather than decoding a subset", () => {
    expect(parseConsentFlags("tpz")).toBeNull();
    expect(parseConsentFlags("garbage")).toBeNull();
  });

  it("round-trips through the start-route query form", () => {
    const flags = { terms: true, pdProcessing: true, marketing: false };
    const params = new URLSearchParams(consentFlagsToQuery(flags));
    expect(consentFlagsFromParams(params)).toEqual(flags);
  });

  it("reads anything that is not an explicit `1` as not granted", () => {
    const params = new URLSearchParams("terms=true&pd=yes&marketing=");
    expect(consentFlagsFromParams(params)).toEqual(EMPTY_CONSENT_FLAGS);
    expect(consentFlagsFromParams(new URLSearchParams(""))).toEqual(EMPTY_CONSENT_FLAGS);
  });
});
