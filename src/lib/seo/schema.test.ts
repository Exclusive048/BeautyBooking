import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./schema";

/**
 * FAST-WINS-BATCH-A — SEC-2 closure (SECURITY-AUDIT-A finding).
 *
 * Locks the `<`-escaping behavior of the JSON-LD serializer that
 * prevents `</script>` breakout from user-controlled fields embedded
 * inside `<script type="application/ld+json">` tags.
 *
 * Pure helper, deterministic — no fixtures needed.
 */

describe("safeJsonLd", () => {
  it("escapes every `<` to the JSON unicode escape `\\u003c`", () => {
    const malicious = { name: "alice</script><script>alert(1)</script>" };
    const result = safeJsonLd(malicious);
    expect(result).not.toContain("</script>");
    expect(result).not.toContain("<");
    expect(result).toContain("\\u003c/script>");
  });

  it("preserves valid JSON structure (round-trips through JSON.parse after unescape)", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Person",
      name: "Анна Соколова",
      url: "https://master-ryadom.online/u/anna",
    };
    const serialized = safeJsonLd(schema);
    // Unicode escapes are valid JSON — parser handles them transparently
    expect(JSON.parse(serialized)).toEqual(schema);
  });

  it("escapes nested user-controlled fields, not just top-level strings", () => {
    const schema = {
      "@context": "https://schema.org",
      "@type": "Review",
      reviewBody: "Great! </script><img src=x onerror=alert(1)>",
      author: { "@type": "Person", name: "<script>evil</script>" },
    };
    const result = safeJsonLd(schema);
    expect(result).not.toContain("<");
    // Unescape and re-parse to verify content preserved
    const restored = JSON.parse(result.replace(/\\u003c/g, "<"));
    expect(restored.reviewBody).toContain("</script>");
    expect(restored.author.name).toBe("<script>evil</script>");
  });

  it("handles primitives and empty objects without crashing", () => {
    expect(safeJsonLd({})).toBe("{}");
    expect(safeJsonLd(null)).toBe("null");
    expect(safeJsonLd("plain")).toBe('"plain"');
  });
});
