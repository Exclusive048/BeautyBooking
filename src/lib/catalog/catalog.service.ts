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

export type CatalogProviderItem = {
  type: "master" | "studio";
  id: string;
  publicUsername: string | null;
  title: string;
  avatarUrl: string | null;
  avatarFocalX: number | null;
  avatarFocalY: number | null;
  ratingAvg: number;
  reviewsCount: number;
  distanceMeters: number | null;
  photos: string[];
  geoLat: number | null;
  geoLng: number | null;
  primaryService: {
    title: string;
    price: number;
    durationMin: number;
  } | null;
  minPrice: number | null;
  nextSlot: { startAt: string } | null;
  todaySlotsCount?: number;
};

export type CatalogModelOfferItem = {
  type: "modelOffer";
  id: string;
  masterId: string;
  masterName: string;
  masterAvatarUrl: string | null;
  masterPublicUsername: string | null;
  serviceTitle: string;
  categoryTitle: string | null;
  durationMin: number;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  price: number | null;
  requirements: string[];
};

export type CatalogSearchItem = CatalogProviderItem | CatalogModelOfferItem;

export type CatalogSearchResult = {
  items: CatalogSearchItem[];
  nextCursor: string | null;
};

type CatalogSearchInput = {
  serviceQuery?: string;
  district?: string;
  date?: string;
  priceMin?: number;
  priceMax?: number;
  availableToday?: boolean;
  hot?: boolean;
  globalCategoryId?: string;
  includeChildCategories?: boolean;
  ratingMin?: number;
  smartTag?: CatalogSmartTagPreset;
  entityType?: CatalogEntityType;
  modelOffers?: boolean;
  limit: number;
  cursor?: string;
  lat?: number;
  lng?: number;
  bbox?: string;
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

type MapBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

function parseBbox(value: string | undefined): MapBounds | null {
  if (!value) return null;
  const parts = value
    .split(",")
    .map((part) => Number(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (parts.length !== 4) return null;
  const [minLat, minLng, maxLat, maxLng] = parts;
  if (minLat > maxLat || minLng > maxLng) return null;
  return { minLat, minLng, maxLat, maxLng };
}

async function resolveCategoryFilterIds(
  globalCategoryId: string | undefined,
  includeChildCategories: boolean | undefined
): Promise<string[]> {
  const normalizedId = globalCategoryId?.trim();
  if (!normalizedId) return [];

  const root = await prisma.globalCategory.findUnique({
    where: { id: normalizedId },
    select: { id: true, status: true, isSystem: true },
  });
  if (!root || root.status !== "APPROVED" || root.isSystem) return [];

  if (includeChildCategories === false) {
    return [root.id];
  }

  const rows = await prisma.globalCategory.findMany({
    where: { status: "APPROVED", isSystem: false },
    select: { id: true, parentId: true },
  });

  const childrenByParent = new Map<string, string[]>();
  for (const row of rows) {
    if (!row.parentId) continue;
    const bucket = childrenByParent.get(row.parentId) ?? [];
    bucket.push(row.id);
    childrenByParent.set(row.parentId, bucket);
  }

  const ids = new Set<string>([root.id]);
  const queue: string[] = [root.id];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const children = childrenByParent.get(current) ?? [];
    for (const childId of children) {
      if (ids.has(childId)) continue;
      ids.add(childId);
      queue.push(childId);
    }
  }

  return Array.from(ids);
}

function buildWhere(
  input: CatalogSearchInput,
  hotProviderIds?: string[],
  bounds?: MapBounds | null,
  categoryIds?: string[]
): Prisma.ProviderWhereInput {
  const and: Prisma.ProviderWhereInput[] = [];
  const serviceQuery = input.serviceQuery?.trim();

  and.push({ isPublished: true });

  and.push({
    OR: [
      {
        services: {
          some: {
            isEnabled: true,
            isActive: true,
          },
        },
      },
      {
        masterServices: {
          some: {
            isEnabled: true,
            service: {
              isEnabled: true,
              isActive: true,
            },
          },
        },
      },
    ],
  });

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

  if (hotProviderIds) {
    and.push({ id: { in: hotProviderIds } });
  }

  if (categoryIds && categoryIds.length > 0) {
    and.push({
      OR: [
        {
          services: {
            some: {
              isEnabled: true,
              isActive: true,
              globalCategoryId: { in: categoryIds },
            },
          },
        },
        {
          masterServices: {
            some: {
              isEnabled: true,
              service: {
                isEnabled: true,
                isActive: true,
                globalCategoryId: { in: categoryIds },
              },
            },
          },
        },
        {
          portfolioItems: {
            some: {
              isPublic: true,
              inSearch: true,
              globalCategoryId: { in: categoryIds },
            },
          },
        },
        {
          masters: {
            some: {
              portfolioItems: {
                some: {
                  isPublic: true,
                  inSearch: true,
                  globalCategoryId: { in: categoryIds },
                },
              },
            },
          },
        },
      ],
    });
  }

  if (bounds) {
    and.push({
      geoLat: { gte: bounds.minLat, lte: bounds.maxLat },
    });
    and.push({
      geoLng: { gte: bounds.minLng, lte: bounds.maxLng },
    });
  }

  if (serviceQuery) {
    const serviceFilters: Prisma.ServiceWhereInput = {
      isEnabled: true,
      isActive: true,
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

async function loadHotProviderIds(): Promise<string[]> {
  const now = new Date();
  const to = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const items = await prisma.hotSlot.findMany({
    where: {
      isActive: true,
      expiresAtUtc: { gt: now },
      startAtUtc: { gte: now, lt: to },
    },
    distinct: ["providerId"],
    select: { providerId: true },
  });
  return items.map((item) => item.providerId);
}

export async function searchCatalog(input: CatalogSearchInput): Promise<CatalogSearchResult> {
  if (input.modelOffers) {
    return searchModelOffers(input);
  }

  const hotProviderIds = input.hot ? await loadHotProviderIds() : null;
  if (input.hot && (!hotProviderIds || hotProviderIds.length === 0)) {
    return { items: [], nextCursor: null };
  }

  const categoryIds = await resolveCategoryFilterIds(
    input.globalCategoryId,
    input.includeChildCategories
  );
  if (input.globalCategoryId && categoryIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  const where = buildWhere(
    input,
    hotProviderIds ?? undefined,
    parseBbox(input.bbox),
    categoryIds.length > 0 ? categoryIds : undefined
  );
  const cursorId = input.cursor?.trim();
  const take = Math.min(Math.max(input.limit, 1), 40);

  const providers = await prisma.provider.findMany({
    where,
    orderBy: [{ ratingAvg: "desc" }, { reviews: "desc" }, { createdAt: "desc" }, { id: "asc" }],
    take: take + 1,
    ...(cursorId
      ? {
          skip: 1,
          cursor: { id: cursorId },
        }
      : {}),
    select: {
      id: true,
      type: true,
      name: true,
      publicUsername: true,
      avatarUrl: true,
      avatarFocalX: true,
      avatarFocalY: true,
      ratingAvg: true,
      reviews: true,
      priceFrom: true,
      geoLat: true,
      geoLng: true,
      availableToday: true,
      services: {
        where: { isEnabled: true, isActive: true },
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
        where: { isEnabled: true, service: { isEnabled: true, isActive: true } },
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

  const items: CatalogProviderItem[] = rankedRows.map((provider) => {
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
      avatarFocalX: provider.avatarFocalX ?? null,
      avatarFocalY: provider.avatarFocalY ?? null,
      ratingAvg: provider.ratingAvg,
      reviewsCount: provider.reviews,
      distanceMeters: null,
      photos,
      geoLat: provider.geoLat ?? null,
      geoLng: provider.geoLng ?? null,
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
    nextCursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
  };
}

function resolveOfferDuration(input: {
  durationOverrideMin: number | null;
  baseDurationMin: number | null;
  durationMin: number;
}): number {
  return input.durationOverrideMin ?? input.baseDurationMin ?? input.durationMin;
}

function toPriceNumber(value: Prisma.Decimal | null): number | null {
  if (!value) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

async function searchModelOffers(input: CatalogSearchInput): Promise<CatalogSearchResult> {
  const and: Prisma.ModelOfferWhereInput[] = [{ status: "ACTIVE" }];
  const categoryIds = await resolveCategoryFilterIds(
    input.globalCategoryId,
    input.includeChildCategories
  );
  if (input.globalCategoryId && categoryIds.length === 0) {
    return { items: [], nextCursor: null };
  }

  if (categoryIds.length > 0) {
    and.push({
      masterService: {
        service: {
          globalCategoryId: { in: categoryIds },
        },
      },
    });
  }

  const serviceQuery = input.serviceQuery?.trim();
  if (serviceQuery) {
    and.push({
      masterService: {
        service: {
          OR: [
            { name: { contains: serviceQuery, mode: "insensitive" } },
            { title: { contains: serviceQuery, mode: "insensitive" } },
            { category: { is: { title: { contains: serviceQuery, mode: "insensitive" } } } },
          ],
        },
      },
    });
  }

  if (input.district) {
    and.push({ master: { district: { contains: input.district, mode: "insensitive" } } });
  }

  if (input.date) {
    and.push({ dateLocal: input.date });
  } else if (input.availableToday) {
    const today = new Date().toISOString().slice(0, 10);
    and.push({ dateLocal: today });
  }

  if (typeof input.priceMin === "number") {
    and.push({ price: { gte: input.priceMin } });
  }

  if (typeof input.priceMax === "number") {
    const allowFree = typeof input.priceMin !== "number" || input.priceMin <= 0;
    and.push({
      OR: [
        { price: { lte: input.priceMax } },
        ...(allowFree ? [{ price: null }] : []),
      ],
    });
  }

  const where: Prisma.ModelOfferWhereInput =
    and.length > 0 ? { AND: and, master: { isPublished: true } } : { master: { isPublished: true } };

  const cursorId = input.cursor?.trim();
  const take = Math.min(Math.max(input.limit, 1), 40);

  const offers = await prisma.modelOffer.findMany({
    where,
    orderBy: [
      { dateLocal: "asc" },
      { timeRangeStartLocal: "asc" },
      { createdAt: "desc" },
      { id: "asc" },
    ],
    take: take + 1,
    ...(cursorId
      ? {
          skip: 1,
          cursor: { id: cursorId },
        }
      : {}),
    select: {
      id: true,
      masterId: true,
      dateLocal: true,
      timeRangeStartLocal: true,
      timeRangeEndLocal: true,
      price: true,
      requirements: true,
      master: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          publicUsername: true,
        },
      },
      masterService: {
        select: {
          durationOverrideMin: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              durationMin: true,
              baseDurationMin: true,
              category: { select: { title: true } },
            },
          },
        },
      },
    },
  });

  const hasMore = offers.length > take;
  const rows = hasMore ? offers.slice(0, -1) : offers;

  const items: CatalogModelOfferItem[] = rows.map((offer) => {
    const service = offer.masterService.service;
    return {
      type: "modelOffer",
      id: offer.id,
      masterId: offer.masterId,
      masterName: offer.master?.name ?? "Master",
      masterAvatarUrl: offer.master?.avatarUrl ?? null,
      masterPublicUsername: offer.master?.publicUsername ?? null,
      serviceTitle: service.title?.trim() || service.name,
      categoryTitle: service.category?.title ?? null,
      durationMin: resolveOfferDuration({
        durationOverrideMin: offer.masterService.durationOverrideMin ?? null,
        baseDurationMin: service.baseDurationMin ?? null,
        durationMin: service.durationMin,
      }),
      dateLocal: offer.dateLocal,
      timeRangeStartLocal: offer.timeRangeStartLocal,
      timeRangeEndLocal: offer.timeRangeEndLocal,
      price: toPriceNumber(offer.price),
      requirements: offer.requirements,
    };
  });

  return {
    items,
    nextCursor: hasMore ? rows[rows.length - 1]?.id ?? null : null,
  };
}

