import { describe, expect, it } from "vitest";
import {
  normalizeSocialLink,
  resolveStoredSocialLink,
  safeSocialHref,
  socialDisplayLabel,
} from "./social-links";

describe("normalizeSocialLink — VK", () => {
  it("accepts a bare handle → canonical vk.com URL", () => {
    expect(normalizeSocialLink("vk", "durov")).toEqual({
      status: "ok",
      url: "https://vk.com/durov",
      handle: "durov",
    });
  });

  it("accepts an @handle", () => {
    expect(normalizeSocialLink("vk", "@durov")).toEqual({
      status: "ok",
      url: "https://vk.com/durov",
      handle: "durov",
    });
  });

  it("accepts a bare host/path (no scheme)", () => {
    expect(normalizeSocialLink("vk", "vk.com/durov")).toEqual({
      status: "ok",
      url: "https://vk.com/durov",
      handle: "durov",
    });
  });

  it("accepts a full https URL and strips query/fragment", () => {
    expect(normalizeSocialLink("vk", "https://vk.com/durov?utm=x#frag")).toEqual({
      status: "ok",
      url: "https://vk.com/durov",
      handle: "durov",
    });
  });

  it("canonicalizes www. and m. subdomains to the base host", () => {
    expect(normalizeSocialLink("vk", "https://www.vk.com/club123")).toMatchObject({
      url: "https://vk.com/club123",
    });
    expect(normalizeSocialLink("vk", "m.vk.com/public42")).toMatchObject({
      url: "https://vk.com/public42",
    });
  });

  it("upgrades http to https (host reconstructed from safe base)", () => {
    expect(normalizeSocialLink("vk", "http://vk.com/durov")).toMatchObject({
      url: "https://vk.com/durov",
    });
  });

  it("accepts id / club / public style handles", () => {
    expect(normalizeSocialLink("vk", "vk.com/id777")).toMatchObject({ handle: "id777" });
  });
});

describe("normalizeSocialLink — Instagram", () => {
  it("accepts a bare handle with dots/underscores", () => {
    expect(normalizeSocialLink("instagram", "anna.nails_studio")).toEqual({
      status: "ok",
      url: "https://instagram.com/anna.nails_studio",
      handle: "anna.nails_studio",
    });
  });

  it("accepts a full instagram URL", () => {
    expect(normalizeSocialLink("instagram", "https://instagram.com/anna?hl=ru")).toMatchObject({
      url: "https://instagram.com/anna",
    });
  });

  it("canonicalizes www.instagram.com", () => {
    expect(normalizeSocialLink("instagram", "www.instagram.com/anna")).toMatchObject({
      url: "https://instagram.com/anna",
    });
  });
});

describe("normalizeSocialLink — empty / clear", () => {
  it.each([null, undefined, "", "   ", "@", " @ "])("treats %p as empty (clear)", (input) => {
    expect(normalizeSocialLink("vk", input as string | null | undefined)).toEqual({
      status: "empty",
    });
  });
});

describe("🔴 SECURITY — hostile input is rejected/sanitized, never a live dangerous href", () => {
  it("rejects javascript: scheme (bare, no //)", () => {
    expect(normalizeSocialLink("vk", "javascript:alert(1)")).toEqual({ status: "invalid" });
    expect(normalizeSocialLink("instagram", "javascript:alert(document.cookie)")).toEqual({
      status: "invalid",
    });
  });

  it("rejects javascript:// scheme (with //)", () => {
    expect(normalizeSocialLink("vk", "javascript://vk.com/%0aalert(1)")).toEqual({
      status: "invalid",
    });
  });

  it("rejects data: URIs", () => {
    expect(normalizeSocialLink("vk", "data:text/html,<script>alert(1)</script>")).toEqual({
      status: "invalid",
    });
  });

  it("rejects a foreign host (evil.com) via path form", () => {
    expect(normalizeSocialLink("vk", "evil.com/durov")).toEqual({ status: "invalid" });
    expect(normalizeSocialLink("vk", "https://evil.com/durov")).toEqual({ status: "invalid" });
  });

  it("rejects a look-alike host that merely contains the allowed host as a substring", () => {
    expect(normalizeSocialLink("vk", "https://vk.com.evil.com/durov")).toEqual({
      status: "invalid",
    });
    expect(normalizeSocialLink("vk", "https://notvk.com/durov")).toEqual({ status: "invalid" });
    expect(normalizeSocialLink("instagram", "https://instagram.com.evil.io/x")).toEqual({
      status: "invalid",
    });
  });

  it("does not confuse instagram host on a vk field (cross-host rejected)", () => {
    expect(normalizeSocialLink("vk", "https://instagram.com/anna")).toEqual({ status: "invalid" });
    expect(normalizeSocialLink("instagram", "https://vk.com/durov")).toEqual({ status: "invalid" });
  });

  it("rejects a bare token with dangerous characters", () => {
    for (const bad of [
      '"><script>',
      "a b",
      "a/b",
      "a:b",
      "<img src=x>",
      "durov;alert(1)",
      "a".repeat(65),
    ]) {
      expect(normalizeSocialLink("vk", bad)).toEqual({ status: "invalid" });
    }
  });

  it("rejects a lone allowed-host domain (no handle)", () => {
    expect(normalizeSocialLink("vk", "vk.com")).toEqual({ status: "invalid" });
    expect(normalizeSocialLink("instagram", "instagram.com")).toEqual({ status: "invalid" });
  });

  it("rejects malformed URLs", () => {
    expect(normalizeSocialLink("vk", "https://")).toEqual({ status: "invalid" });
    expect(normalizeSocialLink("vk", "://vk.com/x")).toEqual({ status: "invalid" });
  });

  it("guarantees a resolved URL is always on the allowed host with https", () => {
    for (const input of [
      "durov",
      "@durov",
      "vk.com/durov",
      "https://www.vk.com/durov?x=1",
      "m.vk.com/id5",
      "http://vk.com/club9",
    ]) {
      const result = normalizeSocialLink("vk", input);
      expect(result.status).toBe("ok");
      if (result.status === "ok") {
        expect(result.url.startsWith("https://vk.com/")).toBe(true);
      }
    }
  });
});

describe("resolveStoredSocialLink (server persist helper)", () => {
  it("returns null for empty (clear)", () => {
    expect(resolveStoredSocialLink("vk", "")).toEqual({ value: null });
    expect(resolveStoredSocialLink("vk", null)).toEqual({ value: null });
  });

  it("returns the normalized URL for valid input", () => {
    expect(resolveStoredSocialLink("vk", "@durov")).toEqual({ value: "https://vk.com/durov" });
  });

  it("returns { invalid: true } for hostile input", () => {
    expect(resolveStoredSocialLink("vk", "javascript:alert(1)")).toEqual({ invalid: true });
    expect(resolveStoredSocialLink("vk", "https://evil.com/x")).toEqual({ invalid: true });
  });

  it("is idempotent on an already-normalized URL", () => {
    const once = resolveStoredSocialLink("vk", "vk.com/durov");
    expect(once).toEqual({ value: "https://vk.com/durov" });
    if ("value" in once && once.value) {
      expect(resolveStoredSocialLink("vk", once.value)).toEqual({ value: "https://vk.com/durov" });
    }
  });
});

describe("safeSocialHref (render defense-in-depth)", () => {
  it("returns a safe href for a valid stored URL", () => {
    expect(safeSocialHref("vk", "https://vk.com/durov")).toBe("https://vk.com/durov");
  });

  it("returns null for a corrupted / dangerous stored value", () => {
    expect(safeSocialHref("vk", "javascript:alert(1)")).toBeNull();
    expect(safeSocialHref("vk", "https://evil.com/x")).toBeNull();
    expect(safeSocialHref("vk", null)).toBeNull();
    expect(safeSocialHref("vk", "")).toBeNull();
  });
});

describe("socialDisplayLabel (cabinet preview)", () => {
  it("shows a clean host/handle label", () => {
    expect(socialDisplayLabel("vk", "https://vk.com/durov")).toBe("vk.com/durov");
    expect(socialDisplayLabel("instagram", "@anna")).toBe("instagram.com/anna");
  });

  it("returns null for invalid/empty", () => {
    expect(socialDisplayLabel("vk", "evil.com/x")).toBeNull();
    expect(socialDisplayLabel("vk", "")).toBeNull();
  });
});
