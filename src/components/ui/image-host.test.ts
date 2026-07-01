import { describe, expect, it } from "vitest";
import {
  ALLOWED_REMOTE_IMAGE_HOSTS,
  IMAGE_FALLBACK_SRC,
  isOptimizableImageSrc,
} from "./image-host";

// FIX-21 (IMG-RESILIENCE-SWEEP): lock the host-guard contract that <ResilientImage>
// relies on so every migrated surface degrades a bad image to the placeholder
// instead of throwing / breaking its route. Pure string logic → node-safe.
describe("isOptimizableImageSrc", () => {
  it("accepts local / same-origin paths", () => {
    expect(isOptimizableImageSrc("/portfolio-placeholders/placeholder.svg")).toBe(true);
    expect(isOptimizableImageSrc("/api/media/abc123")).toBe(true);
    expect(isOptimizableImageSrc("/uploads/x.webp")).toBe(true);
  });

  it("accepts http(s) URLs only on allow-listed hosts", () => {
    expect(isOptimizableImageSrc("https://storage.yandexcloud.net/bucket/x.jpg")).toBe(true);
    expect(isOptimizableImageSrc("http://storage.yandexcloud.net/bucket/x.jpg")).toBe(true);
  });

  it("rejects unconfigured remote hosts (the FIX-12 throw class)", () => {
    expect(isOptimizableImageSrc("https://evil.example.com/x.jpg")).toBe(false);
    expect(isOptimizableImageSrc("https://cdn.unknown.io/a.png")).toBe(false);
  });

  it("rejects local blob/object previews — they are NOT remote-host class", () => {
    // Reference-photo / crop / composer previews use createObjectURL — these
    // must keep their raw <img>, never route through ResilientImage (would regress
    // to the placeholder). The guard returns false for them by design.
    expect(isOptimizableImageSrc("blob:http://localhost:3000/uuid")).toBe(false);
    expect(isOptimizableImageSrc("data:image/png;base64,AAAA")).toBe(false);
  });

  it("rejects empty / malformed / missing src", () => {
    expect(isOptimizableImageSrc("")).toBe(false);
    expect(isOptimizableImageSrc(null)).toBe(false);
    expect(isOptimizableImageSrc(undefined)).toBe(false);
    expect(isOptimizableImageSrc("not a url")).toBe(false);
  });

  it("keeps the allow-list mirroring next.config remotePatterns", () => {
    // Guards against silent drift: if a host is added to next.config it must be
    // added here too (and vice-versa) or new hosts degrade to the placeholder.
    expect(ALLOWED_REMOTE_IMAGE_HOSTS).toContain("storage.yandexcloud.net");
  });

  it("exposes a same-origin placeholder that can never trip the guard", () => {
    expect(IMAGE_FALLBACK_SRC.startsWith("/")).toBe(true);
    expect(isOptimizableImageSrc(IMAGE_FALLBACK_SRC)).toBe(true);
  });
});
