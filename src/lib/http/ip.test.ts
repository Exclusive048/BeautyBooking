import { describe, expect, it } from "vitest";

import { extractClientIp, getClientIp } from "./ip";

/**
 * HARDENING-08 FIX-17 — the client-IP extractor must peel trusted proxy hops
 * from the RIGHT of X-Forwarded-For and NEVER return the client-spoofable
 * leftmost entry (the old bug that let an attacker rotate the leftmost value to
 * dodge per-IP OTP/SMS rate limits). Tests pass `trustedHops`/`realIpHeader`
 * explicitly so they don't depend on ambient env; one case relies on the env
 * default (1) via the no-options path.
 */

function makeRequest(headers: Record<string, string>): Request {
  return new Request("http://localhost/api/whatever", { headers });
}

const REAL = "203.0.113.9"; // a legit downstream client IP
const SPOOF = "1.1.1.1"; // an attacker-prepended leftmost entry

describe("extractClientIp — trusted-proxy XFF peeling", () => {
  it("ignores a forged LEFTMOST entry and returns the proxy-appended rightmost (hops=1)", () => {
    const req = makeRequest({ "x-forwarded-for": `${SPOOF}, ${REAL}` });
    expect(extractClientIp(req, { trustedHops: 1 })).toBe(REAL);
  });

  it("single XFF entry (legit single hop) → returns it unchanged (drop-in for old logic)", () => {
    const req = makeRequest({ "x-forwarded-for": REAL });
    expect(extractClientIp(req, { trustedHops: 1 })).toBe(REAL);
  });

  it("peels N hops from the right when TRUSTED_PROXY_HOPS=2 (CDN + LB edge)", () => {
    // client-spoof, real-client(socket at edge1), edge1(seen by edge2)
    const req = makeRequest({ "x-forwarded-for": `${SPOOF}, ${REAL}, 10.0.0.1` });
    expect(extractClientIp(req, { trustedHops: 2 })).toBe(REAL);
  });

  it("clamps to the leftmost when hops exceeds the entry count (over-config → coarse, still deterministic)", () => {
    const req = makeRequest({ "x-forwarded-for": `a, b` });
    expect(extractClientIp(req, { trustedHops: 5 })).toBe("a");
  });

  it("a non-finite/<=0 hop count falls back to 1 (never NaN → never the raw leftmost)", () => {
    const req = makeRequest({ "x-forwarded-for": `${SPOOF}, ${REAL}` });
    expect(extractClientIp(req, { trustedHops: Number.NaN })).toBe(REAL);
    expect(extractClientIp(req, { trustedHops: 0 })).toBe(REAL);
    expect(extractClientIp(req, { trustedHops: -3 })).toBe(REAL);
  });

  it("trims whitespace and drops empty XFF entries", () => {
    const req = makeRequest({ "x-forwarded-for": `  , ,  ${REAL}  ` });
    expect(extractClientIp(req, { trustedHops: 1 })).toBe(REAL);
  });

  it("XFF that is only whitespace/commas → no entries → falls through", () => {
    const req = makeRequest({ "x-forwarded-for": ` , , `, "x-real-ip": "198.51.100.7" });
    expect(extractClientIp(req, { trustedHops: 1 })).toBe("198.51.100.7");
  });
});

describe("extractClientIp — fallbacks", () => {
  it("no XFF → falls back to x-real-ip", () => {
    const req = makeRequest({ "x-real-ip": "198.51.100.7" });
    expect(extractClientIp(req, { trustedHops: 1 })).toBe("198.51.100.7");
  });

  it("no XFF and no x-real-ip → null (getClientIp → 'unknown')", () => {
    const req = makeRequest({});
    expect(extractClientIp(req, { trustedHops: 1 })).toBeNull();
    expect(getClientIp(req)).toBe("unknown");
  });

  it("uses the env default hop count (1) when no options are passed", () => {
    const req = makeRequest({ "x-forwarded-for": `${SPOOF}, ${REAL}` });
    // Env default TRUSTED_PROXY_HOPS=1 → still the rightmost, not the spoof.
    expect(extractClientIp(req)).toBe(REAL);
  });
});

describe("extractClientIp — dedicated real-IP header", () => {
  it("prefers a configured realIpHeader over XFF when the header is present", () => {
    const req = makeRequest({
      "x-forwarded-for": `${SPOOF}, ${REAL}`,
      "cf-connecting-ip": "198.51.100.42",
    });
    expect(extractClientIp(req, { realIpHeader: "cf-connecting-ip" })).toBe("198.51.100.42");
  });

  it("falls through to XFF peel when the configured realIpHeader is absent", () => {
    const req = makeRequest({ "x-forwarded-for": `${SPOOF}, ${REAL}` });
    expect(extractClientIp(req, { realIpHeader: "cf-connecting-ip", trustedHops: 1 })).toBe(REAL);
  });

  it("ignores an empty realIpHeader value (whitespace-only) and uses XFF", () => {
    const req = makeRequest({
      "x-forwarded-for": `${SPOOF}, ${REAL}`,
      "cf-connecting-ip": "   ",
    });
    expect(extractClientIp(req, { realIpHeader: "cf-connecting-ip", trustedHops: 1 })).toBe(REAL);
  });
});

describe("extractClientIp — OTP rate-limit shared-bucket invariant", () => {
  it("two requests with the SAME real client but DIFFERENT forged leftmost entries resolve to the same key", () => {
    // The core of the fix: an attacker cannot split the rate-limit bucket by
    // rotating the leftmost XFF entry — the derived IP is stable.
    const attackerA = makeRequest({ "x-forwarded-for": `9.9.9.9, ${REAL}` });
    const attackerB = makeRequest({ "x-forwarded-for": `7.7.7.7, ${REAL}` });
    const attackerC = makeRequest({ "x-forwarded-for": `deadbeef-not-an-ip, ${REAL}` });

    const a = extractClientIp(attackerA, { trustedHops: 1 });
    const b = extractClientIp(attackerB, { trustedHops: 1 });
    const c = extractClientIp(attackerC, { trustedHops: 1 });

    expect(a).toBe(REAL);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });
});
