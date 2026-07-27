import { describe, it, expect } from "vitest";
import { parseInternalPath, sanitizeInternalPath } from "@/lib/http/safe-redirect";

const PROBE = "https://internal.invalid";

/** A relative path is "safe" iff resolving it against ANY origin stays on it. */
function staysSameOrigin(path: string): boolean {
  return new URL(path, PROBE).origin === PROBE;
}

describe("parseInternalPath — rejects every off-origin form", () => {
  // Each of these produced (or could produce) an off-origin Location before the
  // fix. The backslash and TAB/LF forms are the exact open-redirect bypasses
  // from SECURITY-EXPOSURE-AUDIT-01 (O1).
  const OFF_ORIGIN = [
    "/\\evil.example", // backslash → scheme-relative for special schemes
    "/\\/\\/evil.example",
    "//evil.example", // protocol-relative
    "///evil.example",
    "https://evil.example",
    "http://evil.example/path",
    "HTTPS://evil.example",
    "/\t//evil.example", // TAB spliced — URL parser strips it
    "/\n//evil.example", // LF
    "/\r//evil.example", // CR
    "\\/\\/evil.example",
    "javascript:alert(1)",
    "  //evil.example  ",
  ];

  it.each(OFF_ORIGIN)("rejects %j → null", (input) => {
    expect(parseInternalPath(input)).toBeNull();
  });

  it("never returns a path that resolves off-origin", () => {
    for (const input of OFF_ORIGIN) {
      const out = parseInternalPath(input);
      if (out !== null) {
        // If it ever returns non-null it MUST be same-origin — this is the
        // invariant that, if it ever breaks, is the open redirect again.
        expect(staysSameOrigin(out)).toBe(true);
      }
    }
  });

  it.each([null, undefined, "", "   ", "cabinet/profile", "@evil.example"])(
    "rejects non-path input %j → null",
    (input) => {
      expect(parseInternalPath(input as string | null)).toBeNull();
    }
  );
});

describe("parseInternalPath — preserves legitimate internal paths", () => {
  it.each([
    ["/cabinet/profile", "/cabinet/profile"],
    ["/cabinet/bookings", "/cabinet/bookings"],
    ["/cabinet/bookings?focus=abc", "/cabinet/bookings?focus=abc"],
    ["/cabinet/bookings?focus=abc#top", "/cabinet/bookings?focus=abc#top"],
    ["/u/anna-sokolova/booking", "/u/anna-sokolova/booking"],
    ["/@evil.example", "/@evil.example"], // leading slash → harmless same-origin path
    ["/path/with\\backslash", "/path/with/backslash"], // backslash inside path normalises, stays same-origin
  ])("keeps %j → %j", (input, expected) => {
    const out = parseInternalPath(input);
    expect(out).toBe(expected);
    expect(staysSameOrigin(out as string)).toBe(true);
  });
});

describe("sanitizeInternalPath — falls back instead of returning null", () => {
  it("returns the default fallback for an off-origin target", () => {
    expect(sanitizeInternalPath("/\\evil.example")).toBe("/cabinet/profile");
  });
  it("honours a custom fallback", () => {
    expect(sanitizeInternalPath("//evil", "/cabinet")).toBe("/cabinet");
  });
  it("passes a legitimate path through unchanged", () => {
    expect(sanitizeInternalPath("/cabinet/bookings")).toBe("/cabinet/bookings");
  });
});
