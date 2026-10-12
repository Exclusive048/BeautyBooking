import { describe, expect, it } from "vitest";
import { buildProviderSchema, safeJsonLd } from "./schema";

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

describe("buildProviderSchema", () => {
  const base = {
    id: "p1",
    type: "MASTER" as const,
    name: "Анна",
    description: null,
    publicUsername: "anna",
    avatarUrl: "/api/media/file/abc/crop/1",
    address: "ул. Ленина, 1",
    cityName: "Липецк",
    geoLat: null,
    geoLng: null,
    ratingAvg: 0,
    ratingCount: 0,
    services: [{ name: "Маникюр", price: 150_000, durationMin: 60 }],
  };

  it("SEO-02: цена услуги — в рублях (в БД копейки), город — addressLocality", () => {
    const schema = buildProviderSchema(base, "https://masterryadom.ru");
    expect(schema?.makesOffer).toEqual([
      expect.objectContaining({ price: 1500, priceCurrency: "RUB" }),
    ]);
    expect(schema?.address).toMatchObject({ addressLocality: "Липецк", addressCountry: "RU" });
    expect(schema?.image).toBe("https://masterryadom.ru/api/media/file/abc/crop/1");
  });
});
