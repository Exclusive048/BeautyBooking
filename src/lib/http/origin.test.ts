import test from "node:test";
import assert from "node:assert/strict";
import { buildSameOriginRedirectUrl, getPublicOrigin, normalizeInternalPath } from "@/lib/http/origin";

test("buildSameOriginRedirectUrl uses forwarded headers over req.url", () => {
  const req = new Request("http://localhost:3000/api/auth/vk/callback", {
    headers: {
      "x-forwarded-proto": "https",
      "x-forwarded-host": "beautyhub.art",
    },
  });

  const url = buildSameOriginRedirectUrl(req, "/cabinet/studio");
  assert.equal(url.toString(), "https://beautyhub.art/cabinet/studio");
});

test("getPublicOrigin falls back to host header and http proto", () => {
  const req = new Request("http://localhost:3000/api/auth/vk/callback", {
    headers: {
      host: "beautyhub.art",
    },
  });

  const origin = getPublicOrigin(req);
  assert.equal(origin, "http://beautyhub.art");
});

test("normalizeInternalPath blocks external or invalid targets", () => {
  assert.equal(normalizeInternalPath("http://evil.com"), "/cabinet/profile");
  assert.equal(normalizeInternalPath("javascript:alert(1)"), "/cabinet/profile");
  assert.equal(normalizeInternalPath("cabinet/studio"), "/cabinet/profile");
  assert.equal(normalizeInternalPath("/cabinet/studio?x=1"), "/cabinet/studio?x=1");
});
