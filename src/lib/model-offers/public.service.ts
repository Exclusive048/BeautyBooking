import { Prisma, ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PublicModelOfferCategory = {
  id: string;
  title: string;
  slug: string | null;
};

export type PublicModelOfferService = {
  id: string;
  title: string;
  description: string | null;
  durationMin: number;
  /** Master's price for this service (after MasterService.priceOverride). The
   *  pre-discount price the offer.price is compared against. */
  originalPrice: number | null;
  category: PublicModelOfferCategory | null;
};

export type PublicModelOfferMaster = {
  id: string;
  name: string;
  publicUsername: string | null;
  avatarUrl: string | null;
  ratingAvg: number;
  ratingCount: number;
  city: string | null;
};

export type PublicModelOfferItem = {
  publicCode: string;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  price: number | null;
  /** Extra time the master needs after the service for content/photos. */
  extraBusyMin: number;
  requirements: string[];
  service: PublicModelOfferService;
  master: PublicModelOfferMaster;
};

export type PublicModelOffersQuery = {
  categoryId?: string;
  /** Filter to providers in this city (preferred — uses Provider.cityId index). */
  cityId?: string;
  /** Legacy: substring match against provider.address. Kept for the detail page until it migrates. */
  city?: string;
  page: number;
  limit: number;
};

export type PublicModelOffersResult = {
  items: PublicModelOfferItem[];
  nextPage: number | null;
};

export type PublicModelOfferFilters = {
  categories: PublicModelOfferFilterCategory[];
  citySuggestions: string[];
};

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

function todayDateString(): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString().slice(0, 10);
}

function normalizeAddressPart(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function cityFromAddress(address: string): string | null {
  const parts = address
    .split(",")
    .map((part) => normalizeAddressPart(part))
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const token = parts[i];
    if (token.length < 2) continue;
    if (!/[A-Za-zА-Яа-яЁё]/.test(token)) continue;
    return token;
  }
  return null;
}

type ResolvedService = {
  id: string;
  name: string;
  title: string | null;
  description: string | null;
  durationMin: number;
  baseDurationMin: number | null;
  price: number;
  globalCategory: { id: string; name: string; slug: string | null } | null;
};

type ResolvedMasterService = {
  durationOverrideMin: number | null;
  priceOverride: number | null;
  service: ResolvedService;
};

function resolveOfferService(input: {
  masterService: ResolvedMasterService | null;
  service: ResolvedService | null;
}): {
  durationOverrideMin: number | null;
  priceOverride: number | null;
  service: ResolvedService;
} | null {
  if (input.masterService) {
    return {
      durationOverrideMin: input.masterService.durationOverrideMin ?? null,
      priceOverride: input.masterService.priceOverride ?? null,
      service: input.masterService.service,
    };
  }
  if (input.service) {
    return {
      durationOverrideMin: null,
      priceOverride: null,
      service: input.service,
    };
  }
  return null;
}

function toPublicItem(input: {
  id: string;
  publicCode: string;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  price: Prisma.Decimal | null;
  extraBusyMin: number;
  requirements: string[];
  master: {
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
    ratingAvg: number;
    ratingCount: number;
    address: string;
    district: string;
  };
  masterService: ResolvedMasterService | null;
  service: ResolvedService | null;
}): PublicModelOfferItem | null {
  const offerService = resolveOfferService({
    masterService: input.masterService,
    service: input.service,
  });
  if (!offerService) return null;

  const service = offerService.service;
  const originalPrice = offerService.priceOverride ?? service.price;
  return {
    publicCode: input.publicCode,
    dateLocal: input.dateLocal,
    timeRangeStartLocal: input.timeRangeStartLocal,
    timeRangeEndLocal: input.timeRangeEndLocal,
    price: toPriceNumber(input.price),
    extraBusyMin: input.extraBusyMin ?? 0,
    requirements: input.requirements ?? [],
    service: {
      id: service.id,
      title: service.title?.trim() || service.name,
      description: service.description ?? null,
      durationMin: resolveOfferDuration({
        durationOverrideMin: offerService.durationOverrideMin ?? null,
        baseDurationMin: service.baseDurationMin ?? null,
        durationMin: service.durationMin,
      }),
      originalPrice: Number.isFinite(originalPrice) ? originalPrice : null,
      category: service.globalCategory
        ? {
            id: service.globalCategory.id,
            title: service.globalCategory.name,
            slug: service.globalCategory.slug ?? null,
          }
        : null,
    },
    master: {
      id: input.master.id,
      name: input.master.name,
      publicUsername: input.master.publicUsername ?? null,
      avatarUrl: input.master.avatarUrl ?? null,
      ratingAvg: input.master.ratingAvg,
      ratingCount: input.master.ratingCount,
      city: cityFromAddress(input.master.address) ?? cityFromAddress(input.master.district) ?? null,
    },
  };
}

export async function listPublicModelOffers(input: PublicModelOffersQuery): Promise<PublicModelOffersResult> {
  const masterWhere: Prisma.ProviderWhereInput = {
    isPublished: true,
    type: ProviderType.MASTER,
  };
  if (input.cityId) {
    masterWhere.cityId = input.cityId;
  } else if (input.city) {
    masterWhere.address = { contains: input.city, mode: "insensitive" };
  }

  const and: Prisma.ModelOfferWhereInput[] = [
    { status: "ACTIVE" },
    { dateLocal: { gte: todayDateString() } },
    { master: masterWhere },
  ];

  if (input.categoryId) {
    and.push({
      OR: [
        { masterService: { is: { service: { globalCategoryId: input.categoryId } } } },
        { service: { is: { globalCategoryId: input.categoryId } } },
      ],
    });
  }

  const where: Prisma.ModelOfferWhereInput = and.length > 0 ? { AND: and } : {};
  const take = Math.min(Math.max(input.limit, 1), 40);
  const skip = Math.max(input.page - 1, 0) * take;

  const offers = await prisma.modelOffer.findMany({
    where,
    orderBy: [{ dateLocal: "asc" }, { timeRangeStartLocal: "asc" }, { createdAt: "desc" }],
    skip,
    take: take + 1,
    select: {
      id: true,
      dateLocal: true,
      timeRangeStartLocal: true,
      timeRangeEndLocal: true,
      price: true,
      extraBusyMin: true,
      requirements: true,
      master: {
        select: {
          id: true,
          name: true,
          address: true,
          avatarUrl: true,
          publicUsername: true,
          ratingAvg: true,
          ratingCount: true,
          district: true,
        },
      },
      masterService: {
        select: {
          durationOverrideMin: true,
          priceOverride: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              description: true,
              durationMin: true,
              baseDurationMin: true,
              price: true,
              globalCategory: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          title: true,
          description: true,
          durationMin: true,
          baseDurationMin: true,
          price: true,
          globalCategory: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  const hasMore = offers.length > take;
  const rows = hasMore ? offers.slice(0, -1) : offers;

  // TODO: inline publicCode into select above after `npx prisma generate` (migration 20260411180000)
  const offerIds = rows.map((o) => o.id);
  const codeRows = offerIds.length
    ? await prisma.$queryRaw<Array<{ id: string; publicCode: string }>>`
        SELECT id, "publicCode" FROM "ModelOffer" WHERE id = ANY(${offerIds})`
    : [];
  const publicCodeMap = new Map(codeRows.map((r) => [r.id, r.publicCode]));

  return {
    items: rows
      .map((o) => {
        const publicCode = publicCodeMap.get(o.id);
        if (!publicCode) return null;
        return toPublicItem({ ...o, publicCode });
      })
      .filter((item): item is PublicModelOfferItem => Boolean(item)),
    nextPage: hasMore ? input.page + 1 : null,
  };
}

export async function getPublicModelOffer(code: string): Promise<PublicModelOfferItem | null> {
  if (!code) return null;

  // TODO: replace $queryRaw with typed findFirst after `npx prisma generate` (migration 20260411180000)
  const [codeRow] = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT mo.id FROM "ModelOffer" mo
    JOIN "Provider" p ON p.id = mo."masterId"
    WHERE mo."publicCode" = ${code}
      AND mo.status = 'ACTIVE'
      AND mo."dateLocal" >= ${todayDateString()}
      AND p."isPublished" = true
      AND p.type = 'MASTER'
    LIMIT 1`;
  if (!codeRow) return null;

  const offer = await prisma.modelOffer.findFirst({
    where: { id: codeRow.id },
    select: {
      id: true,
      dateLocal: true,
      timeRangeStartLocal: true,
      timeRangeEndLocal: true,
      price: true,
      extraBusyMin: true,
      requirements: true,
      master: {
        select: {
          id: true,
          name: true,
          address: true,
          avatarUrl: true,
          publicUsername: true,
          ratingAvg: true,
          ratingCount: true,
          district: true,
        },
      },
      masterService: {
        select: {
          durationOverrideMin: true,
          priceOverride: true,
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              description: true,
              durationMin: true,
              baseDurationMin: true,
              price: true,
              globalCategory: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
      service: {
        select: {
          id: true,
          name: true,
          title: true,
          description: true,
          durationMin: true,
          baseDurationMin: true,
          price: true,
          globalCategory: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });

  if (!offer) return null;
  return toPublicItem({ ...offer, publicCode: code });
}

export type PublicModelOfferFilterCategory = {
  id: string;
  name: string;
};

async function listModelOfferCategoriesWithOffers(todayStr: string): Promise<PublicModelOfferFilterCategory[]> {
  return prisma.globalCategory.findMany({
    where: {
      status: "APPROVED",
      visibleToAll: true,
      isSystem: false,
      NOT: [{ visualSearchSlug: "hot" }],
      services: {
        some: {
          OR: [
            { modelOffers: { some: { status: "ACTIVE", dateLocal: { gte: todayStr } } } },
            {
              masterServices: {
                some: {
                  modelOffers: { some: { status: "ACTIVE", dateLocal: { gte: todayStr } } },
                },
              },
            },
          ],
        },
      },
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listModelOfferFilterCategories(): Promise<PublicModelOfferFilterCategory[]> {
  const todayStr = todayDateString();
  const categories = await listModelOfferCategoriesWithOffers(todayStr);
  if (categories.length > 0) return categories;

  return prisma.globalCategory.findMany({
    where: {
      status: "APPROVED",
      visibleToAll: true,
      isSystem: false,
      NOT: [{ visualSearchSlug: "hot" }],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function listModelOfferCitySuggestions(): Promise<string[]> {
  const addresses = await prisma.provider.findMany({
    where: {
      type: ProviderType.MASTER,
      isPublished: true,
      address: { not: "" },
    },
    select: { address: true },
    distinct: ["address"],
    take: 50,
    orderBy: { address: "asc" },
  });

  const cityMap = new Map<string, string>();
  for (const item of addresses) {
    const city = cityFromAddress(item.address);
    if (!city) continue;
    const key = city.toLowerCase();
    if (!cityMap.has(key)) cityMap.set(key, city);
  }

  return Array.from(cityMap.values()).sort((a, b) => a.localeCompare(b, "ru"));
}

export async function listModelOfferFilters(): Promise<PublicModelOfferFilters> {
  const [categories, citySuggestions] = await Promise.all([
    listModelOfferFilterCategories(),
    listModelOfferCitySuggestions(),
  ]);

  return { categories, citySuggestions };
}
