import {
  BookingStatus,
  PlanTier,
  ProviderType,
  SubscriptionStatus,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type FavoriteKind = "master" | "studio";

export type FavoriteCardDTO = {
  providerId: string;
  type: FavoriteKind;
  name: string;
  tagline: string | null;
  rating: number;
  reviewsCount: number;
  publicUsername: string | null;
  address: string | null;

  photoUrl: string | null;
  hue: number;

  isPremium: boolean;

  visitsCount: number;
  lastVisitIso: string | null;

  startingPrice: number | null;

  mastersCount: number | null;

  favoritedAt: string;
};

export type FavoritesEnrichedPayload = {
  masters: FavoriteCardDTO[];
  studios: FavoriteCardDTO[];
};

const HUE_SEED_SHIFT = 17;

function deriveHueFromId(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash << HUE_SEED_SHIFT) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

async function getFirstPortfolioPhotos(
  providerIds: string[],
): Promise<Map<string, string>> {
  if (providerIds.length === 0) return new Map();

  // One pass — group by masterId picking the most recent in-search photo.
  // We sort by createdAt desc and `distinctOn` would be ideal but Prisma's
  // groupBy doesn't return scalar columns alongside aggregates. A simple
  // findMany + JS reduce is plenty fast for N≤200 favorites.
  const rows = await prisma.portfolioItem.findMany({
    where: {
      masterId: { in: providerIds },
      inSearch: true,
      isPublic: true,
    },
    orderBy: { createdAt: "desc" },
    select: { masterId: true, mediaUrl: true },
  });

  const out = new Map<string, string>();
  for (const row of rows) {
    if (!out.has(row.masterId)) out.set(row.masterId, row.mediaUrl);
  }
  return out;
}

async function getVisitsCounts(
  userId: string,
  providerIds: string[],
): Promise<Map<string, number>> {
  if (providerIds.length === 0) return new Map();
  const rows = await prisma.booking.groupBy({
    by: ["providerId"],
    where: {
      clientUserId: userId,
      providerId: { in: providerIds },
      status: BookingStatus.FINISHED,
    },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.providerId, r._count._all]));
}

async function getLastVisits(
  userId: string,
  providerIds: string[],
): Promise<Map<string, Date>> {
  if (providerIds.length === 0) return new Map();
  const rows = await prisma.booking.groupBy({
    by: ["providerId"],
    where: {
      clientUserId: userId,
      providerId: { in: providerIds },
      status: BookingStatus.FINISHED,
      endAtUtc: { not: null },
    },
    _max: { endAtUtc: true },
  });
  const out = new Map<string, Date>();
  for (const r of rows) {
    if (r._max.endAtUtc) out.set(r.providerId, r._max.endAtUtc);
  }
  return out;
}

async function getMinPrices(
  providerIds: string[],
): Promise<Map<string, number>> {
  if (providerIds.length === 0) return new Map();
  const rows = await prisma.service.groupBy({
    by: ["providerId"],
    where: {
      providerId: { in: providerIds },
      isEnabled: true,
    },
    _min: { price: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r._min.price !== null && r._min.price > 0) {
      out.set(r.providerId, r._min.price);
    }
  }
  return out;
}

/**
 * Premium status: provider's owner has an active UserSubscription with
 * `plan.tier = PREMIUM` covering the master scope. Studio premium follows
 * the same rule via the studio owner's subscription. We accept ACTIVE and
 * PAST_DUE (grace period) — same definition as `isPremium` elsewhere.
 */
async function getPremiumStatuses(
  ownerIds: string[],
  providers: Array<{ id: string; ownerUserId: string | null }>,
): Promise<Map<string, boolean>> {
  if (ownerIds.length === 0) return new Map();

  const subs = await prisma.userSubscription.findMany({
    where: {
      userId: { in: ownerIds },
      status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
      plan: { tier: PlanTier.PREMIUM },
    },
    select: { userId: true },
  });

  const premiumOwners = new Set(subs.map((s) => s.userId));
  const out = new Map<string, boolean>();
  for (const p of providers) {
    out.set(p.id, p.ownerUserId ? premiumOwners.has(p.ownerUserId) : false);
  }
  return out;
}

export async function listFavoritesEnriched(
  userId: string,
): Promise<FavoritesEnrichedPayload> {
  const favorites = await prisma.userFavorite.findMany({
    where: { userId, provider: { isPublished: true } },
    orderBy: { createdAt: "desc" },
    include: {
      provider: {
        select: {
          id: true,
          type: true,
          name: true,
          tagline: true,
          publicUsername: true,
          avatarUrl: true,
          ratingAvg: true,
          reviews: true,
          address: true,
          ownerUserId: true,
          // Studio masters count — only meaningful when type === STUDIO,
          // but the select is cheap to include unconditionally.
          studioProfile: {
            select: {
              studioMembers: {
                where: { status: "ACTIVE" },
                select: { id: true },
              },
            },
          },
        },
      },
    },
  });

  if (favorites.length === 0) {
    return { masters: [], studios: [] };
  }

  const providerIds = favorites.map((f) => f.providerId);
  const ownerIds = Array.from(
    new Set(
      favorites
        .map((f) => f.provider.ownerUserId)
        .filter((v): v is string => !!v),
    ),
  );
  const masterProviderIds = favorites
    .filter((f) => f.provider.type === ProviderType.MASTER)
    .map((f) => f.providerId);

  const [photoMap, visitsMap, lastVisitMap, priceMap, premiumMap] = await Promise.all([
    getFirstPortfolioPhotos(masterProviderIds),
    getVisitsCounts(userId, providerIds),
    getLastVisits(userId, providerIds),
    getMinPrices(providerIds),
    getPremiumStatuses(
      ownerIds,
      favorites.map((f) => ({
        id: f.provider.id,
        ownerUserId: f.provider.ownerUserId,
      })),
    ),
  ]);

  const cards: FavoriteCardDTO[] = favorites.map((fav) => {
    const p = fav.provider;
    const kind: FavoriteKind = p.type === ProviderType.STUDIO ? "studio" : "master";
    return {
      providerId: p.id,
      type: kind,
      name: p.name,
      tagline: p.tagline?.trim() || null,
      rating: Number(p.ratingAvg ?? 0),
      reviewsCount: p.reviews ?? 0,
      publicUsername: p.publicUsername,
      address: p.address,
      photoUrl: photoMap.get(p.id) ?? p.avatarUrl,
      hue: deriveHueFromId(p.id),
      isPremium: premiumMap.get(p.id) ?? false,
      visitsCount: visitsMap.get(p.id) ?? 0,
      lastVisitIso: lastVisitMap.get(p.id)?.toISOString() ?? null,
      startingPrice: priceMap.get(p.id) ?? null,
      mastersCount:
        kind === "studio" ? p.studioProfile?.studioMembers.length ?? 0 : null,
      favoritedAt: fav.createdAt.toISOString(),
    };
  });

  return {
    masters: cards.filter((c) => c.type === "master"),
    studios: cards.filter((c) => c.type === "studio"),
  };
}

// Eliminate unused import lint noise — Prisma type is intentionally exposed
// for future extension (search by tags). Re-export keeps tree-shake happy.
export type _PrismaUserFavoriteFindManyArgs = Prisma.UserFavoriteFindManyArgs;
