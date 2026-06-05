/**
 * CORS-FIXES-BATCH-A — regression tests for the two CORS bugs surfaced
 * by PRE-LAUNCH-QUICK-AUDITS-A (2026-05-31):
 *
 *   Bug 1 (CORS-WWW-FIX-A): `` `www.${PRODUCTION_ORIGIN.replace("https://", "")}` ``
 *   built `"www.мастеррядом.online"` WITHOUT `https://` prefix. Browser
 *   Origin headers always include protocol, so the comparison never
 *   matched → www subdomain users got CORS errors.
 *
 *   Bug 2 (CORS-IDN-FIX-A): Cyrillic IDN literal in the allowlist never
 *   matched the Punycode form (`xn--80aic0adlmagk0m.online`) that modern
 *   browsers send for IDN domains in `Origin` headers.
 *
 * Fix: introduced `normalizeOrigin()` helper using `new URL().origin` —
 * Node's URL parser converts Cyrillic IDN to Punycode automatically, so
 * both the allowlist and the incoming origin pass through normalization
 * and compare as their canonical Punycode form.
 *
 * Tests focus on the pure predicate (no NextRequest mock needed). Same
 * pattern as other proxy-adjacent pure-helper tests (e.g. `prompt-modal.test.tsx`).
 */

import { describe, it, expect } from "vitest";
import { normalizeOrigin } from "./proxy";

describe("normalizeOrigin — IDN + protocol canonicalization", () => {
  it("normalizes Cyrillic IDN to Punycode form", () => {
    expect(normalizeOrigin("https://мастеррядом.online")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });

  it("preserves Punycode form unchanged (already canonical)", () => {
    expect(normalizeOrigin("https://xn--80aic0adlmagk0m.online")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });

  it("normalizes Cyrillic + www subdomain to Punycode + www", () => {
    expect(normalizeOrigin("https://www.мастеррядом.online")).toBe(
      "https://www.xn--80aic0adlmagk0m.online",
    );
  });

  it("returns null for unparseable origin (defensive)", () => {
    expect(normalizeOrigin("not-a-url")).toBeNull();
    expect(normalizeOrigin("")).toBeNull();
  });

  it("preserves protocol — http vs https produce distinct origins", () => {
    expect(normalizeOrigin("http://мастеррядом.online")).toBe(
      "http://xn--80aic0adlmagk0m.online",
    );
    expect(normalizeOrigin("https://мастеррядом.online")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });

  it("preserves non-IDN origins unchanged", () => {
    expect(normalizeOrigin("https://example.com")).toBe("https://example.com");
    expect(normalizeOrigin("https://evil.example.com")).toBe(
      "https://evil.example.com",
    );
  });

  it("strips path / query / hash from the origin (security-critical — only scheme+host+port match)", () => {
    expect(normalizeOrigin("https://мастеррядом.online/admin?x=1#hash")).toBe(
      "https://xn--80aic0adlmagk0m.online",
    );
  });
});

describe("CORS allowlist via normalizeOrigin — both bugs regression-pinned", () => {
  // Mirror of PRODUCTION_ALLOWLIST_NORMALIZED inside proxy.ts. The Set
  // semantics + normalization are what the real getAllowedOrigin() does.
  const PRODUCTION_ALLOWLIST = new Set(
    [
      "https://мастеррядом.online",
      "https://www.мастеррядом.online",
    ]
      .map(normalizeOrigin)
      .filter((value): value is string => value !== null),
  );

  function isAllowed(incoming: string): boolean {
    const normalized = normalizeOrigin(incoming);
    if (!normalized) return false;
    return PRODUCTION_ALLOWLIST.has(normalized);
  }

  // Bug 1 regression (www subdomain comparison missing protocol)
  it("allows browser-sent www form в Cyrillic", () => {
    expect(isAllowed("https://www.мастеррядом.online")).toBe(true);
  });

  it("allows browser-sent www form в Punycode (Bug 1 regression)", () => {
    // This was blocked PRE-fix because the broken `"www.мастеррядом.online"`
    // string also wouldn't match the Punycode form.
    expect(isAllowed("https://www.xn--80aic0adlmagk0m.online")).toBe(true);
  });

  // Bug 2 regression (Punycode allowlist mismatch)
  it("allows bare Cyrillic origin", () => {
    expect(isAllowed("https://мастеррядом.online")).toBe(true);
  });

  it("allows bare Punycode origin (Bug 2 regression — browsers send this form)", () => {
    expect(isAllowed("https://xn--80aic0adlmagk0m.online")).toBe(true);
  });

  // Negative cases — security-critical to confirm normalization didn't
  // accidentally widen the allowlist
  it("rejects unrelated origin", () => {
    expect(isAllowed("https://evil.example.com")).toBe(false);
  });

  it("rejects wrong protocol (http instead of https) — IDN normalization preserves protocol", () => {
    expect(isAllowed("http://мастеррядом.online")).toBe(false);
    expect(isAllowed("http://xn--80aic0adlmagk0m.online")).toBe(false);
  });

  it("rejects look-alike domain (subdomain hijack defense)", () => {
    // Trying to fake www.мастеррядом.online by registering xn--80aic0adlmagk0m.online.evil.com
    expect(isAllowed("https://xn--80aic0adlmagk0m.online.evil.com")).toBe(false);
  });

  it("rejects empty/malformed Origin", () => {
    expect(isAllowed("")).toBe(false);
    expect(isAllowed("not-a-url")).toBe(false);
  });

  it("rejects unauthorized subdomain (e.g. api.мастеррядом.online)", () => {
    // Only bare + www are allowed; arbitrary subdomains must NOT be admitted
    expect(isAllowed("https://api.мастеррядом.online")).toBe(false);
    expect(isAllowed("https://admin.мастеррядом.online")).toBe(false);
  });
});
