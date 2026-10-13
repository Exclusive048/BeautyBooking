import { kopeksToRubles, toKopeks } from "@/lib/money/kopeks";

export type ProviderSchemaInput = {
  id: string;
  type: "MASTER" | "STUDIO";
  name: string;
  description: string | null;
  publicUsername: string | null;
  avatarUrl: string | null;
  address: string | null;
  /** Город — `addressLocality` (раньше туда шёл район). */
  cityName: string | null;
  geoLat: number | null;
  geoLng: number | null;
  ratingAvg: number;
  ratingCount: number;
  /** `price` — в копейках, как в БД; в разметку уходит в рублях. */
  services: Array<{ name: string; price: number; durationMin: number }>;
  reviews?: Array<{
    rating: number;
    text: string | null;
    authorName: string | null;
    createdAt: Date;
  }>;
};

export function buildProviderSchema(input: ProviderSchemaInput, baseUrl?: string | null): Record<string, unknown> | null {
  if (!input.publicUsername) return null;

  const url = baseUrl ? `${baseUrl}/u/${input.publicUsername}` : `/u/${input.publicUsername}`;
  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HealthAndBeautyBusiness",
    name: input.name,
    url,
  };

  if (input.description) {
    schema.description = input.description;
  }

  if (input.avatarUrl) {
    // Аватар хранится путём сайта (`/api/media/file/…`), а разметке нужен
    // полный адрес.
    schema.image = baseUrl && input.avatarUrl.startsWith("/") ? `${baseUrl}${input.avatarUrl}` : input.avatarUrl;
  }

  if (input.address || input.cityName) {
    schema.address = {
      "@type": "PostalAddress",
      streetAddress: input.address ?? undefined,
      addressLocality: input.cityName ?? undefined,
      addressCountry: "RU",
    };
  }

  if (typeof input.geoLat === "number" && typeof input.geoLng === "number") {
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: input.geoLat,
      longitude: input.geoLng,
    };
  }

  if (input.ratingCount > 0 && input.ratingAvg > 0) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: Number(input.ratingAvg.toFixed(1)),
      reviewCount: input.ratingCount,
    };
  }

  const offers = input.services
    .filter((service) => Number.isFinite(service.price) && service.price > 0)
    .slice(0, 10)
    .map((service) => ({
      "@type": "Offer",
      // SEO-02: цена хранится в копейках — без перевода поисковик видел
      // услугу за 1 500 ₽ как за 150 000 ₽.
      price: kopeksToRubles(toKopeks(service.price)),
      priceCurrency: "RUB",
      itemOffered: {
        "@type": "Service",
        name: service.name,
      },
    }));

  if (offers.length > 0) {
    schema.makesOffer = offers;
  }

  const reviews = input.reviews?.filter((review) => Number.isFinite(review.rating) && review.rating > 0) ?? [];
  if (reviews.length > 0) {
    schema.review = reviews.map((review) => ({
      "@type": "Review",
      reviewRating: {
        "@type": "Rating",
        ratingValue: review.rating,
      },
      author: review.authorName
        ? {
            "@type": "Person",
            name: review.authorName,
          }
        : undefined,
      reviewBody: review.text ?? undefined,
      datePublished: review.createdAt.toISOString(),
    }));
  }

  return schema;
}

/**
 * Safe serialization of a JSON-LD schema for embedding inside
 * `<script type="application/ld+json" dangerouslySetInnerHTML=...>`.
 *
 * Escapes `<` to `<` so a user-controlled string containing
 * `</script>` (or any HTML-looking fragment) cannot break out of
 * the script tag. Standard JSON-LD XSS mitigation — valid JSON-LD
 * parsers handle the unicode escape transparently, SEO unaffected.
 *
 * Defense-in-depth: CSP (nonce + strict-dynamic + no unsafe-inline)
 * already blocks any injected script execution in production, but
 * the escape removes the structural breakout possibility entirely.
 *
 * FAST-WINS-BATCH-A — SEC-2 closure (SECURITY-AUDIT-A finding).
 */
export function safeJsonLd(schema: unknown): string {
  return JSON.stringify(schema).replace(/</g, "\\u003c");
}
