import { buildSameOriginRedirectUrl, getPublicOrigin, normalizeInternalPath } from "@/lib/http/origin";

describe("http/origin", () => {
  it("uses forwarded headers for public origin", () => {
    const req = new Request("http://internal.local/path", {
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "example.com",
      },
    });
    expect(getPublicOrigin(req)).toBe("https://example.com");
  });

  it("falls back to request url origin", () => {
    const req = new Request("https://fallback.local/path");
    expect(getPublicOrigin(req)).toBe("https://fallback.local");
  });

  it("normalizes internal path and rejects external urls", () => {
    expect(normalizeInternalPath("")).toBe("/cabinet/profile");
    expect(normalizeInternalPath("http://evil.com")).toBe("/cabinet/profile");
    expect(normalizeInternalPath("//evil.com")).toBe("/cabinet/profile");
    expect(normalizeInternalPath("/good/path")).toBe("/good/path");
  });

  it("builds same-origin redirect urls", () => {
    const req = new Request("https://example.com/path");
    const url = buildSameOriginRedirectUrl(req, "/target");
    expect(url.toString()).toBe("https://example.com/target");
  });
});
