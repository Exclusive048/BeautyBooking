export type ProviderSchemaInput = {
  id: string;
  type: "MASTER" | "STUDIO";
  name: string;
  description: string | null;
  publicUsername: string | null;
  avatarUrl: string | null;
  address: string | null;
  district: string | null;
  geoLat: number | null;
  geoLng: number | null;
  ratingAvg: number;
  ratingCount: number;
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
    schema.image = input.avatarUrl;
  }

  if (input.address || input.district) {
    schema.address = {
      "@type": "PostalAddress",
      streetAddress: input.address ?? undefined,
      addressLocality: input.district ?? undefined,
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
      price: service.price,
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
