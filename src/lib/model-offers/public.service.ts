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
  id: string;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  price: number | null;
  requirements: string[];
  service: PublicModelOfferService;
  master: PublicModelOfferMaster;
};

export type PublicModelOffersQuery = {
  categoryId?: string;
  city?: string;
  page: number;
  limit: number;
};

export type PublicModelOffersResult = {
  items: PublicModelOfferItem[];
  nextPage: number | null;
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

function todayLocal(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPublicItem(input: {
  id: string;
  dateLocal: string;
  timeRangeStartLocal: string;
  timeRangeEndLocal: string;
  price: Prisma.Decimal | null;
  requirements: string[];
  master: {
    id: string;
    name: string;
    avatarUrl: string | null;
    publicUsername: string | null;
    ratingAvg: number;
    ratingCount: number;
    district: string;
  };
  masterService: {
    durationOverrideMin: number | null;
    service: {
      id: string;
      name: string;
      title: string | null;
      description: string | null;
      durationMin: number;
      baseDurationMin: number | null;
      globalCategory: { id: string; name: string; slug: string | null } | null;
    };
  };
}): PublicModelOfferItem {
  const service = input.masterService.service;
  return {
    id: input.id,
    dateLocal: input.dateLocal,
    timeRangeStartLocal: input.timeRangeStartLocal,
    timeRangeEndLocal: input.timeRangeEndLocal,
    price: toPriceNumber(input.price),
    requirements: input.requirements ?? [],
    service: {
      id: service.id,
      title: service.title?.trim() || service.name,
      description: service.description ?? null,
      durationMin: resolveOfferDuration({
        durationOverrideMin: input.masterService.durationOverrideMin ?? null,
        baseDurationMin: service.baseDurationMin ?? null,
        durationMin: service.durationMin,
      }),
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
      city: input.master.district ?? null,
    },
  };
}

export async function listPublicModelOffers(input: PublicModelOffersQuery): Promise<PublicModelOffersResult> {
  const and: Prisma.ModelOfferWhereInput[] = [
    { status: "ACTIVE" },
    { dateLocal: { gte: todayLocal() } },
    { master: { isPublished: true, type: ProviderType.MASTER } },
  ];

  if (input.city) {
    and.push({ master: { district: { contains: input.city, mode: "insensitive" } } });
  }

  if (input.categoryId) {
    and.push({ masterService: { service: { globalCategoryId: input.categoryId } } });
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
      requirements: true,
      master: {
        select: {
          id: true,
          name: true,
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
          service: {
            select: {
              id: true,
              name: true,
              title: true,
              description: true,
              durationMin: true,
              baseDurationMin: true,
              globalCategory: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  const hasMore = offers.length > take;
  const rows = hasMore ? offers.slice(0, -1) : offers;

  return {
    items: rows.map(toPublicItem),
    nextPage: hasMore ? input.page + 1 : null,
  };
}

export async function getPublicModelOffer(offerId: string): Promise<PublicModelOfferItem | null> {
  if (!offerId) return null;

  const offer = await prisma.modelOffer.findFirst({
    where: {
      id: offerId,
      status: "ACTIVE",
      dateLocal: { gte: todayLocal() },
      master: { isPublished: true, type: ProviderType.MASTER },
    },
    select: {
      id: true,
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
          ratingAvg: true,
          ratingCount: true,
          district: true,
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
              description: true,
              durationMin: true,
              baseDurationMin: true,
              globalCategory: { select: { id: true, name: true, slug: true } },
            },
          },
        },
      },
    },
  });

  return offer ? toPublicItem(offer) : null;
}
