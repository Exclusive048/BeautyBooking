import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { CatalogEntityType, CatalogSmartTagPreset } from "@/lib/catalog/schemas";

// AUDIT (section 6):
// - Search supports smart tag presets via soft ranking.
// - Strategy: boost providers with selected-tag count >= threshold, never hard-filter all others.
type ServiceLite = {
  id: string;
  name: string;
  title: string | null;
  price: number;
  durationMin: number;
  categoryTitle: string | null;
};

export type CatalogSearchItem = {
  type: "master" | "studio";
  id: string;
  publicUsername: string | null;
  title: string;
  avatarUrl: string | null;
  ratingAvg: number;
  reviewsCount: number;
  distanceMeters: number | null;
  photos: string[];
  primaryService: {
    title: string;
    price: number;
    durationMin: number;
  } | null;
  minPrice: number | null;
  nextSlot: { startAt: string } | null;
  todaySlotsCount?: number;
};

export type CatalogSearchResult = {
  items: CatalogSearchItem[];
  nextCursor: number | null;
};

type CatalogSearchInput = {
  serviceQuery?: string;
  district?: string;
  date?: string;
  priceMin?: number;
  priceMax?: number;
  availableToday?: boolean;
  ratingMin?: number;
  smartTag?: CatalogSmartTagPreset;
  entityType?: CatalogEntityType;
  limit: number;
  cursor?: number;
};

const SMART_TAG_TO_REVIEW_CODE: Record<CatalogSmartTagPreset, string> = {
  rush: "FAST",
  relax: "ATMOSPHERE",
  design: "DESIGN",
  safe: "STERILE",
  silent: "PLEASANT_SILENCE",
};

const SMART_TAG_MIN_COUNT = 3;

function dedupeServices(services: ServiceLite[]): ServiceLite[] {
  const map = new Map<string, ServiceLite>();
  for (const service of services) {
    if (!map.has(service.id)) {
      map.set(service.id, service);
    }
  }
  return Array.from(map.values());
}

function toServiceLite(input: {
  id: string;
  name: string;
  title: string | null;
  price: number;
  durationMin: number;
  category: { title: string } | null;
}): ServiceLite {
  return {
    id: input.id,
    name: input.name,
    title: input.title,
    price: input.price,
    durationMin: input.durationMin,
    categoryTitle: input.category?.title ?? null,
  };
}

function resolvePrimaryService(services: ServiceLite[], serviceQuery?: string): ServiceLite | null {
  if (services.length === 0) return null;
  if (serviceQuery) {
    const query = serviceQuery.toLowerCase();
    const matched = services.find((service) => {
      const title = service.title?.toLowerCase() ?? "";
      const name = service.name.toLowerCase();
      const category = service.categoryTitle?.toLowerCase() ?? "";
      return title.includes(query) || name.includes(query) || category.includes(query);
    });
    if (matched) return matched;
  }

  return [...services]
    .filter((service) => service.price > 0)
    .sort((a, b) => a.price - b.price)[0] ?? services[0];
}

function resolveMinPrice(services: ServiceLite[]): number | null {
  const prices = services.map((service) => service.price).filter((value) => value > 0);
  if (prices.length === 0) return null;
  return Math.min(...prices);
}

function buildWhere(input: CatalogSearchInput): Prisma.ProviderWhereInput {
  const and: Prisma.ProviderWhereInput[] = [];
  const serviceQuery = input.serviceQuery?.trim();

  if (input.entityType === "master") {
    and.push({ type: ProviderType.MASTER });
  } else if (input.entityType === "studio") {
    and.push({ type: ProviderType.STUDIO });
  }

  if (input.district) {
    and.push({
      district: {
        contains: input.district,
        mode: "insensitive",
      },
    });
  }

  if (typeof input.availableToday === "boolean") {
    and.push({ availableToday: input.availableToday });
  }

  if (typeof input.ratingMin === "number") {
    and.push({ ratingAvg: { gte: input.ratingMin } });
  }

  if (typeof input.priceMin === "number") {
    and.push({ priceFrom: { gte: input.priceMin } });
  }

  if (typeof input.priceMax === "number") {
    and.push({ priceFrom: { lte: input.priceMax } });
  }

  if (serviceQuery) {
    const serviceFilters: Prisma.ServiceWhereInput = {
      OR: [
        { name: { contains: serviceQuery, mode: "insensitive" } },
        { title: { contains: serviceQuery, mode: "insensitive" } },
        { category: { is: { title: { contains: serviceQuery, mode: "insensitive" } } } },
      ],
    };
    and.push({
      OR: [
        { services: { some: serviceFilters } },
        {
          masterServices: {
            some: {
              isEnabled: true,
              service: serviceFilters,
            },
          },
        },
      ],
    });
  }

  if (and.length === 0) return {};
  return { AND: and };
}

async function loadSmartTagCounts(
  providerIds: string[],
  preset: CatalogSmartTagPreset | undefined
): Promise<Map<string, number>> {
  if (!preset || providerIds.length === 0) return new Map();
  const tagCode = SMART_TAG_TO_REVIEW_CODE[preset];

  const reviews = await prisma.review.findMany({
    where: {
      targetType: "provider",
      targetId: { in: providerIds },
      tags: {
        some: {
          tag: {
            type: "PUBLIC",
            code: tagCode,
          },
        },
      },
    },
    select: {
      targetId: true,
      tags: {
        where: {
          tag: {
            type: "PUBLIC",
            code: tagCode,
          },
        },
        select: { tagId: true },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const review of reviews) {
    const current = counts.get(review.targetId) ?? 0;
    counts.set(review.targetId, current + review.tags.length);
  }
  return counts;
}

export async function searchCatalog(input: CatalogSearchInput): Promise<CatalogSearchResult> {
  const where = buildWhere(input);
  const skip = input.cursor ?? 0;
  const take = Math.min(Math.max(input.limit, 1), 40);

  const providers = await prisma.provider.findMany({
    where,
    orderBy: [{ ratingAvg: "desc" }, { reviews: "desc" }, { createdAt: "desc" }],
    skip,
    take: take + 1,
    select: {
      id: true,
      type: true,
      name: true,
      publicUsername: true,
      avatarUrl: true,
      ratingAvg: true,
      reviews: true,
      priceFrom: true,
      availableToday: true,
      services: {
        select: {
          id: true,
          name: true,
          title: true,
          price: true,
          durationMin: true,
          category: { select: { title: true } },
        },
      },
      masterServices: {
        where: { isEnabled: true },
        select: {
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              price: true,
              durationMin: true,
              category: { select: { title: true } },
            },
          },
        },
      },
      portfolioItems: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { mediaUrl: true },
      },
      masters: {
        select: {
          portfolioItems: {
            where: { isPublic: true },
            orderBy: { createdAt: "desc" },
            take: 4,
            select: { mediaUrl: true },
          },
        },
      },
    },
  });

  const hasMore = providers.length > take;
  const rows = hasMore ? providers.slice(0, -1) : providers;
  const smartTagCounts = await loadSmartTagCounts(
    rows.map((provider) => provider.id),
    input.smartTag
  );

  const rankedRows = input.smartTag
    ? [...rows]
        .map((provider, index) => ({
          provider,
          index,
          smartCount: smartTagCounts.get(provider.id) ?? 0,
        }))
        .sort((a, b) => {
          const aBoost = a.smartCount >= SMART_TAG_MIN_COUNT ? 1 : 0;
          const bBoost = b.smartCount >= SMART_TAG_MIN_COUNT ? 1 : 0;
          if (aBoost !== bBoost) return bBoost - aBoost;
          if (a.smartCount !== b.smartCount) return b.smartCount - a.smartCount;
          return a.index - b.index;
        })
        .map((entry) => entry.provider)
    : rows;

  const items: CatalogSearchItem[] = rankedRows.map((provider) => {
    const directServices = provider.services.map(toServiceLite);
    const linkedServices = provider.masterServices.map((item) => toServiceLite(item.service));
    const services = dedupeServices([...directServices, ...linkedServices]);

    const primaryService = resolvePrimaryService(services, input.serviceQuery);
    const minPrice = resolveMinPrice(services) ?? (provider.priceFrom > 0 ? provider.priceFrom : null);

    const masterPhotos = provider.portfolioItems.map((item) => item.mediaUrl);
    const studioPhotos = provider.masters.flatMap((master) =>
      master.portfolioItems.map((item) => item.mediaUrl)
    );
    const photos = (provider.type === ProviderType.STUDIO ? studioPhotos : masterPhotos).slice(0, 8);

    return {
      type: provider.type === ProviderType.STUDIO ? "studio" : "master",
      id: provider.id,
      publicUsername: provider.publicUsername ?? null,
      title: provider.name,
      avatarUrl: provider.avatarUrl,
      ratingAvg: provider.ratingAvg,
      reviewsCount: provider.reviews,
      distanceMeters: null,
      photos,
      primaryService: primaryService
        ? {
            title: primaryService.title?.trim() || primaryService.name,
            price: primaryService.price,
            durationMin: primaryService.durationMin,
          }
        : null,
      minPrice,
      nextSlot: null,
      ...(provider.availableToday ? { todaySlotsCount: 1 } : {}),
    };
  });

  return {
    items,
    nextCursor: hasMore ? skip + take : null,
  };
}

