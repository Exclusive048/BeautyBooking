import { Prisma, ProviderType, SubscriptionScope } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CatalogEntityType,
  CatalogSmartTagPreset,
  CatalogSort,
} from "@/lib/catalog/schemas";
import { resolveEffectiveFeatures, type PlanNode } from "@/lib/billing/features";
import * as cache from "@/lib/cache/cache";
import {
  BAYESIAN_PRIOR_FALLBACK,
  bayesianRating,
  sortByBayesianRating,
} from "@/lib/catalog/ranking";
import { ACTIVE_REVIEW_FILTER } from "@/lib/reviews/soft-delete";
// SEC-12: курсорные хелперы переехали в общий модуль — их переиспользуют
// `providers/queries.ts` и `/api/hot-slots`, которые раньше отдавали сырой id.
import { encodeCursor, decodeCursor } from "@/lib/pagination/cursor";
import { decodePublicId } from "@/lib/public-id";

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
  // Rule 12 (QA-103): public search NEVER emits the internal CUID `id` —
  // it enables enumeration + exposes record identity/order. Consumers key
  // off `publicUsername` (profile links, favorites, React keys). The
  // pagination cursor is already opaque (encodeCursor base64url).
  publicUsername: string | null;
  title: string;
  tagline: string | null;
  avatarUrl: string | null;
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
  isHighlighted?: boolean;
  // CATALOG-ENHANCEMENTS-A: surface the provider's `slotPrecision`
  // preference + the existing cheap `availableToday` snapshot so the
  // card can render availability per the provider's chosen
  // presentation (exact / today_free / date_only). `nextSlot` stays
  // null in the listing today — precomputed nearest-slot snapshot is
  // a separate backlog item to avoid N× schedule-engine on the
  // listing.
  slotPrecision?: string;
  availableToday?: boolean;
  /**
   * TZ-DISPLAY-SALON-PARITY-01: the provider's (salon) tz. Used to render
   * `nextSlot` availability in salon-tz when the nearest-slot snapshot pipeline
   * lights up (`nextSlot` is null today, so this is dormant-but-correct).
   */
  timezone?: string;
};

export type CatalogModelOfferItem = {
  type: "modelOffer";
  publicCode: string;
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

export type CatalogPriceBucket = { from: number; to: number; count: number };

export type CatalogSearchResult = {
  items: CatalogSearchItem[];
  nextCursor: string | null;
  /** 15 equal-width buckets covering the active result-set price range. Empty when no priced services. */
  priceDistribution?: CatalogPriceBucket[];
  /** Total provider count matching the current filter set — present only when `page` was provided. */
  totalCount?: number;
  /** Total page count derived from totalCount/limit — present only when `page` was provided. */
  totalPages?: number;
  /** Echoes the requested 1-indexed page when `page` was provided. */
  page?: number;
};

type CatalogSearchInput = {
  serviceQuery?: string;
  district?: string;
  // EXP-021: the header city selector filters `/models` but was a no-op on
  // `/catalog` (the search query never received the selected city). The route
  // resolves the cookie via `getServerCity()` and passes `cityId` here.
  // null/undefined = "all cities" (no filter); a value scopes to that city.
  // Ungeocoded providers (cityId = null) are excluded from a city view —
  // same semantics as `/models`.
  cityId?: string;
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
  sort?: CatalogSort;
  limit: number;
  cursor?: string;
  /** When present, takes precedence over `cursor` and switches the service into offset-based pagination. */
  page?: number;
  lat?: number;
  lng?: number;
  bbox?: string;
};

const PREMIUM_BOOST = 0.5;
const HISTOGRAM_BUCKETS = 15;

// CATALOG-RANKING-01 — prior `C` for the Bayesian «По рейтингу» sort.
const RATING_PRIOR_CACHE_KEY = "catalog:rating-prior:v1";
const RATING_PRIOR_TTL_SECONDS = 600; // 10 min — see loadGlobalMeanRating().

/**
 * `C` — the global mean rating, the prior every provider's score is pulled
 * toward. See `ranking.ts` for the formula.
 *
 * **Only rated providers count.** A never-rated provider has `ratingAvg = 0`,
 * which is a "no data" sentinel and NOT a rating of zero; averaging those in
 * drags the prior from ~4.0 down to ~2.9 (measured), which would make the prior
 * meaningless and over-reward anyone with a single review.
 *
 * **Global, not per-filter.** The prior is deliberately computed over the whole
 * published catalog rather than the current filter set: it represents a stable
 * market-wide expectation. Deriving it per-filter would make the same provider
 * score differently between two views, and a provider's rank would shift for
 * reasons unrelated to its own reviews.
 *
 * **Cached, not per-request.** This is a full-table aggregate; running it on
 * every catalog request would add a scan to a hot discovery path for a value
 * that moves very slowly (it's an average over the entire catalog — one new
 * review barely perturbs it). A 10-minute TTL keeps ranking stable and costs at
 * most one aggregate per 10 min per node. Redis-primary with memory fallback in
 * dev, same as the rest of the cache layer.
 */
async function loadGlobalMeanRating(): Promise<number> {
  const cached = await cache.get<number>(RATING_PRIOR_CACHE_KEY);
  if (typeof cached === "number" && Number.isFinite(cached)) return cached;

  const aggregate = await prisma.provider.aggregate({
    _avg: { ratingAvg: true },
    where: { isPublished: true, reviews: { gt: 0 } },
  });
  const mean = aggregate._avg.ratingAvg;
  const prior =
    typeof mean === "number" && Number.isFinite(mean) && mean > 0
      ? mean
      : BAYESIAN_PRIOR_FALLBACK;

  await cache.set(RATING_PRIOR_CACHE_KEY, prior, RATING_PRIOR_TTL_SECONDS);
  return prior;
}

/**
 * Deterministic base order for every "rank the whole set" query below. Ranking
 * is a *stable* sort over rows already in this order, so equal-score rows keep
 * exactly the tiebreak the catalog has always had (`ratingAvg → reviews →
 * createdAt → id`), and the array index doubles as the old "original Prisma
 * index" tiebreak the relevance path used.
 */
const BASE_ORDER: Prisma.ProviderOrderByWithRelationInput[] = [
  { ratingAvg: "desc" },
  { reviews: "desc" },
  { createdAt: "desc" },
  { id: "asc" },
];

type PageWindow = {
  take: number;
  pageMode: boolean;
  pageOffset: number;
  cursorId: string | null;
};

/**
 * Slice the page out of a globally-ranked list.
 *
 * Returns `take + 1` ids so the caller's existing `hasMore` sentinel logic is
 * unchanged.
 */
function sliceRankedPageIds<T extends { id: string }>(ranked: T[], args: PageWindow): string[] {
  let start = 0;
  if (args.pageMode) {
    start = args.pageOffset;
  } else if (args.cursorId) {
    const index = ranked.findIndex((row) => row.id === args.cursorId);
    // Unknown cursor → restart from the top rather than throw (mirrors the
    // permissive decodeCursor contract).
    start = index >= 0 ? index + 1 : 0;
  }
  return ranked.slice(start, start + args.take + 1).map((row) => row.id);
}

/**
 * ─── Why the "rank whole set, then slice" shape exists ───────────────────────
 *
 * Prisma's `orderBy` can only order by columns. Every sort whose key is a
 * *computed expression* (Bayesian score, relevance composite, min-price across
 * relations) therefore cannot be paged by Postgres. The tempting shortcut —
 * let the DB page by `ratingAvg` and re-sort that page in memory — reorders
 * rows *within a page the DB already chose by the wrong key*, so a provider who
 * belongs at #1 but sits on page 3 by raw average can never surface. That is
 * silent mis-ranking (CATALOG-RANKING-01 measured it; `popular` and
 * `price-desc` still had it before this change).
 *
 * So: rank the whole filtered set on light rows, slice the page, then fetch the
 * page's full rows. `sort=popular` is the exception — its key (`reviews`) IS a
 * column, so it just moves into the query's `orderBy` and is global for free.
 *
 * Cost: one extra query of a few small columns per row matching the filter (44
 * published providers today — negligible). It is a filtered scan, so it does
 * not scale indefinitely; the scale answer is a precomputed score column, i.e.
 * a schema change, deliberately out of scope.
 */
async function resolveRatingRankedPageIds(args: PageWindow & {
  where: Prisma.ProviderWhereInput;
}): Promise<string[]> {
  const [rows, prior] = await Promise.all([
    prisma.provider.findMany({
      where: args.where,
      orderBy: BASE_ORDER,
      select: { id: true, ratingAvg: true, reviews: true, createdAt: true },
    }),
    loadGlobalMeanRating(),
  ]);

  // Rating sort = pure quality signal. No premium/smart-tag boosts here: the
  // user asked for a specific order (pre-existing rule, preserved).
  return sliceRankedPageIds(sortByBayesianRating(rows, prior), args);
}

/**
 * Relevance (the DEFAULT view, and what the home «Топ-мастера» rail consumes).
 *
 * CATALOG-DEFAULT-RANKING-01: relevance is a **composite**, not a rating sort:
 *
 *     score = ratingBase + smartBoost(+1) + premium(+0.5)
 *
 * Only the **rating base** changes here — raw `ratingAvg` → Bayesian score. The
 * smart-tag and Premium signals are untouched, and because the Bayesian score
 * lives on the same 0–5 scale as `ratingAvg`, the boosts keep exactly the
 * relative weight they always had (no re-tuning).
 *
 * It also becomes global: previously the boosts only reordered the already-
 * fetched page, so Premium could never lift a provider from page 2 to page 1.
 *
 * Returns the premium set it had to compute anyway — it is a superset of the
 * page's, so the caller reuses it for the `isHighlighted` flag instead of
 * re-querying.
 */
async function resolveRelevanceRankedPage(args: PageWindow & {
  where: Prisma.ProviderWhereInput;
  smartTag: CatalogSmartTagPreset | undefined;
}): Promise<{
  pageIds: string[];
  highlightedUserIds: Set<string>;
}> {
  const [rows, prior] = await Promise.all([
    prisma.provider.findMany({
      where: args.where,
      orderBy: BASE_ORDER,
      select: {
        id: true,
        ratingAvg: true,
        reviews: true,
        createdAt: true,
        ownerUserId: true,
        type: true,
      },
    }),
    loadGlobalMeanRating(),
  ]);

  const ownerUserIds = [...new Set(rows.filter((r) => r.ownerUserId).map((r) => r.ownerUserId!))];
  const providerTypeMap = new Map(rows.map((r) => [r.ownerUserId ?? "", r.type]));
  const [highlightedUserIds, smartTagCounts] = await Promise.all([
    loadHighlightedUserIds(ownerUserIds, providerTypeMap),
    // No-op (empty map, no query) unless a smart-tag preset is active.
    loadSmartTagCounts(
      args.smartTag ? rows.map((r) => r.id) : [],
      args.smartTag
    ),
  ]);

  const ranked = rows
    .map((provider, index) => {
      const smartCount = smartTagCounts.get(provider.id) ?? 0;
      const smartBoost = args.smartTag && smartCount >= SMART_TAG_MIN_COUNT ? 1 : 0;
      const premium =
        provider.ownerUserId && highlightedUserIds.has(provider.ownerUserId) ? PREMIUM_BOOST : 0;
      const score =
        bayesianRating({ rating: provider.ratingAvg, reviews: provider.reviews, prior }) +
        smartBoost +
        premium;
      return { provider, index, score, smartCount };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      if (a.smartCount !== b.smartCount) return b.smartCount - a.smartCount;
      // `index` is the position in BASE_ORDER — the old "original Prisma index".
      return a.index - b.index;
    })
    .map((entry) => entry.provider);

  return {
    pageIds: sliceRankedPageIds(ranked, args),
    highlightedUserIds,
  };
}

/**
 * Price sorts. Nothing to do with rating — this fixes **global ordering only**.
 *
 * `pickPrice` is a min across two relations with a `priceFrom` fallback, so it
 * isn't a column Postgres can `ORDER BY`; the old in-memory sort therefore only
 * ordered the fetched page (measured: `price-desc&limit=3` reported 279 400 as
 * the dearest while the real maximum was 430 800).
 */
async function resolvePriceRankedPageIds(args: PageWindow & {
  where: Prisma.ProviderWhereInput;
  direction: 1 | -1;
}): Promise<string[]> {
  const rows = await prisma.provider.findMany({
    where: args.where,
    orderBy: BASE_ORDER,
    select: {
      id: true,
      priceFrom: true,
      services: {
        where: { isEnabled: true, isActive: true },
        select: { price: true },
      },
      masterServices: {
        where: { isEnabled: true, service: { isEnabled: true, isActive: true } },
        select: { service: { select: { price: true } } },
      },
    },
  });

  // Same rule as the page-local version it replaces: cheapest enabled service,
  // else `priceFrom`, else last (Infinity).
  const pickPrice = (row: (typeof rows)[number]) => {
    const prices = [
      ...row.services.map((s) => s.price),
      ...row.masterServices.map((m) => m.service.price),
    ].filter((v): v is number => typeof v === "number" && v > 0);
    if (prices.length > 0) return Math.min(...prices);
    return row.priceFrom > 0 ? row.priceFrom : Number.POSITIVE_INFINITY;
  };

  // Stable sort over BASE_ORDER rows → equal prices keep the previous tiebreak.
  const ranked = [...rows].sort((a, b) => (pickPrice(a) - pickPrice(b)) * args.direction);
  return sliceRankedPageIds(ranked, args);
}

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
  // SEC-12: `globalCategoryId` приходит из публичного ответа (автокомплит и
  // `/api/catalog/global-categories`), где id теперь непрозрачный. Декодируем
  // на входе. `decodePublicId` backward-compatible: старая ссылка или закладка
  // с сырым CUID резолвится без изменений.
  const normalizedId = globalCategoryId?.trim()
    ? decodePublicId(globalCategoryId.trim())
    : undefined;
  if (!normalizedId) return [];

  const root = await prisma.globalCategory.findUnique({
    where: { id: normalizedId },
    select: { id: true, status: true, isSystem: true },
  });
  if (!root || root.status !== "APPROVED") return [];

  if (includeChildCategories === false) {
    return [root.id];
  }

  // Children query intentionally does NOT filter by `isSystem` — seed-managed
  // categories run with isSystem=true, while user-proposed ones are
  // isSystem=false. Filtering one side dropped seeded sub-categories, so
  // `nails` no longer expanded to `manicure`/`pedicure` and the catalog
  // returned empty results for parent picks.
  const rows = await prisma.globalCategory.findMany({
    where: { status: "APPROVED" },
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

  // EXP-021: scope to the selected city when one is chosen. No city → no
  // filter (all cities). Mirrors the `/models` city-scoping mechanism.
  if (input.cityId) {
    and.push({ cityId: input.cityId });
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
      ...ACTIVE_REVIEW_FILTER,
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

async function loadHighlightedUserIds(
  ownerUserIds: string[],
  providerTypes: Map<string, ProviderType>
): Promise<Set<string>> {
  if (ownerUserIds.length === 0) return new Set();

  const scopes = new Set<SubscriptionScope>();
  for (const type of providerTypes.values()) {
    scopes.add(type === ProviderType.STUDIO ? SubscriptionScope.STUDIO : SubscriptionScope.MASTER);
  }

  const subscriptions = await prisma.userSubscription.findMany({
    where: {
      userId: { in: ownerUserIds },
      scope: { in: Array.from(scopes) },
      status: { in: ["ACTIVE", "PAST_DUE"] },
    },
    select: {
      userId: true,
      scope: true,
      plan: {
        select: {
          id: true,
          features: true,
          inheritsFromPlanId: true,
          inheritsFromPlan: {
            select: {
              id: true,
              features: true,
              inheritsFromPlanId: true,
              inheritsFromPlan: {
                select: { id: true, features: true, inheritsFromPlanId: true },
              },
            },
          },
        },
      },
    },
  });

  const highlighted = new Set<string>();
  for (const sub of subscriptions) {
    const chain: PlanNode[] = [];
    let current: { id: string; features: unknown; inheritsFromPlanId: string | null; inheritsFromPlan?: { id: string; features: unknown; inheritsFromPlanId: string | null; inheritsFromPlan?: { id: string; features: unknown; inheritsFromPlanId: string | null } | null } | null } | null = sub.plan;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      chain.push({ id: current.id, inheritsFromPlanId: current.inheritsFromPlanId, features: current.features });
      current = (current as { inheritsFromPlan?: typeof current | null }).inheritsFromPlan ?? null;
    }
    const features = resolveEffectiveFeatures(sub.plan.id, new Map(chain.map((n) => [n.id, n])));
    if (features.highlightCard) {
      highlighted.add(sub.userId);
    }
  }
  return highlighted;
}

async function loadHotProviderIds(): Promise<string[]> {
  const items = await prisma.discountRule.findMany({
    where: {
      isEnabled: true,
      provider: { type: "MASTER" },
    },
    select: { providerId: true },
  });
  return Array.from(new Set(items.map((item) => item.providerId)));
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
  const cursorId = input.cursor ? decodeCursor(input.cursor) : null;
  const take = Math.min(Math.max(input.limit, 1), 40);
  // Page-mode (numbered pagination) wins over cursor-mode. We compute total
  // count in parallel so the UI can render `‹ 1 2 3 … N ›`. Cursor stays the
  // legacy / time-search path — see CatalogSearchResult for what we return.
  const pageMode = typeof input.page === "number" && input.page >= 1;
  const pageOffset = pageMode ? (input.page! - 1) * take : 0;
  const totalCount = pageMode ? await prisma.provider.count({ where }) : undefined;

  // Every sort whose key is a computed expression must be ranked across the
  // WHOLE filtered set and then sliced — never re-sorted inside a page the DB
  // picked by a different key. See the block comment above the resolvers.
  //   rating   → Bayesian score                        (CATALOG-RANKING-01)
  //   relevance→ Bayesian base + smart-tag + Premium   (CATALOG-DEFAULT-RANKING-01)
  //   price-*  → min-price across relations            (global-ordering fix only)
  //   popular  → `reviews` IS a column → ordered by the query below, global for
  //              free, and deliberately NOT Bayesian-weighted: «popular» ranks
  //              BY review count, so few-review providers sink on their own —
  //              there is no small-sample distortion to correct.
  //   distance → falls through to relevance (unchanged: no geo ordering yet).
  const pageWindow = { take, pageMode, pageOffset, cursorId };
  const relevanceRanked =
    !input.sort || input.sort === "relevance" || input.sort === "distance"
      ? await resolveRelevanceRankedPage({ where, ...pageWindow, smartTag: input.smartTag })
      : null;
  const rankedPageIds =
    relevanceRanked?.pageIds ??
    (input.sort === "rating"
      ? await resolveRatingRankedPageIds({ where, ...pageWindow })
      : input.sort === "price-asc" || input.sort === "price-desc"
      ? await resolvePriceRankedPageIds({
          where,
          ...pageWindow,
          direction: input.sort === "price-asc" ? 1 : -1,
        })
      : null);

  const providersRaw = await prisma.provider.findMany({
    where: rankedPageIds ? { id: { in: rankedPageIds } } : where,
    orderBy:
      // `popular` is the one non-default sort the DB can express: ordering here
      // makes it global (it used to re-sort only the fetched page, so
      // `limit=3` and `limit=40` disagreed on who was most popular).
      input.sort === "popular"
        ? [{ reviews: "desc" }, { ratingAvg: "desc" }, { createdAt: "desc" }, { id: "asc" }]
        : BASE_ORDER,
    // The ranked paths already narrowed to exactly the page's ids; take/skip
    // would re-slice an already-sliced set.
    ...(rankedPageIds
      ? {}
      : {
          take: take + 1,
          ...(pageMode
            ? { skip: pageOffset }
            : cursorId
            ? {
                skip: 1,
                cursor: { id: cursorId },
              }
            : {}),
        }),
    select: {
      id: true,
      type: true,
      name: true,
      tagline: true,
      publicUsername: true,
      avatarUrl: true,
      ratingAvg: true,
      reviews: true,
      priceFrom: true,
      geoLat: true,
      geoLng: true,
      availableToday: true,
      slotPrecision: true,
      timezone: true,
      ownerUserId: true,
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

  // Restore the global order: `WHERE id IN (…)` returns rows in the query's own
  // orderBy, not in the order of the id list. The last element is the
  // `take + 1` sentinel the `hasMore` check below consumes, so the order must be
  // exact before it is sliced off.
  const providers = rankedPageIds
    ? (rankedPageIds
        .map((id) => providersRaw.find((provider) => provider.id === id))
        .filter((provider): provider is (typeof providersRaw)[number] => Boolean(provider)))
    : providersRaw;

  const hasMore = providers.length > take;
  const rows = hasMore ? providers.slice(0, -1) : providers;

  // Still needed for the `isHighlighted` DTO flag. The relevance ranker already
  // resolved it across the whole filtered set (a superset of this page), so
  // reuse that instead of issuing the same query again.
  //
  // `loadSmartTagCounts` is no longer called out here: smart-tag counts only
  // ever fed the relevance re-rank, which now happens inside the ranker — so
  // for every other sort this was a query whose result nothing read.
  const ownerUserIds = [...new Set(rows.filter((p) => p.ownerUserId).map((p) => p.ownerUserId!))];
  const providerTypeMap = new Map(rows.map((p) => [p.ownerUserId ?? "", p.type]));
  const highlightedUserIds =
    relevanceRanked?.highlightedUserIds ??
    (await loadHighlightedUserIds(ownerUserIds, providerTypeMap));

  // CATALOG-DEFAULT-RANKING-01: there is no in-memory re-rank any more. Every
  // ordering is now decided across the WHOLE filtered set before the page is
  // fetched:
  //   - rating / relevance / price-* → ranked by the resolvers above, this page
  //     was sliced out of that global order (`rankedPageIds`), and `providers`
  //     was re-sorted back into it;
  //   - popular → ordered by the query's `orderBy` on a real column;
  //   - distance → falls through to relevance (no geo ordering yet).
  // Re-sorting here would silently undo that: it can only permute the page,
  // which is exactly the per-page mis-ranking this change removes.
  const rankedRows = rows;

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
      publicUsername: provider.publicUsername ?? null,
      title: provider.name,
      tagline: provider.tagline?.trim() || null,
      avatarUrl: provider.avatarUrl,
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
      slotPrecision: provider.slotPrecision,
      availableToday: provider.availableToday,
      timezone: provider.timezone,
      ...(provider.availableToday ? { todaySlotsCount: 1 } : {}),
      ...(provider.ownerUserId && highlightedUserIds.has(provider.ownerUserId)
        ? { isHighlighted: true }
        : {}),
    };
  });

  // Compute price distribution histogram from minPrice values across the
  // current ranked result set. 15 equal-width buckets — UI snaps the active
  // range slider to these visual cells. Empty when no priced services found.
  const minPrices = items
    .map((it) => it.minPrice)
    .filter((p): p is number => typeof p === "number" && p > 0);

  const priceDistribution: CatalogPriceBucket[] = computePriceDistribution(minPrices);

  // In page-mode `nextCursor` is irrelevant — UI uses page numbers — but we
  // keep it null rather than encoding an offset to avoid two paths reading
  // the same field with different semantics.
  if (pageMode) {
    return {
      items,
      nextCursor: null,
      priceDistribution,
      totalCount: totalCount ?? 0,
      totalPages: Math.max(1, Math.ceil((totalCount ?? 0) / take)),
      page: input.page,
    };
  }

  return {
    items,
    nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!.id) : null,
    priceDistribution,
  };
}

function computePriceDistribution(prices: number[]): CatalogPriceBucket[] {
  if (prices.length === 0) return [];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, 1);
  const step = Math.max(1, Math.round(range / HISTOGRAM_BUCKETS));

  const buckets: CatalogPriceBucket[] = Array.from({ length: HISTOGRAM_BUCKETS }, (_, i) => ({
    from: min + step * i,
    to: i === HISTOGRAM_BUCKETS - 1 ? max : min + step * (i + 1),
    count: 0,
  }));

  for (const p of prices) {
    const idx = Math.min(HISTOGRAM_BUCKETS - 1, Math.floor((p - min) / step));
    buckets[idx]!.count += 1;
  }
  return buckets;
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

function resolveModelOfferService(input: {
  masterService: {
    durationOverrideMin: number | null;
    service: {
      id: string;
      name: string;
      title: string | null;
      durationMin: number;
      baseDurationMin: number | null;
      category: { title: string } | null;
    };
  } | null;
  service: {
    id: string;
    name: string;
    title: string | null;
    durationMin: number;
    baseDurationMin: number | null;
    category: { title: string } | null;
  } | null;
}):
  | {
      service: {
        id: string;
        name: string;
        title: string | null;
        durationMin: number;
        baseDurationMin: number | null;
        category: { title: string } | null;
      };
      durationOverrideMin: number | null;
    }
  | null {
  if (input.masterService) {
    return {
      service: input.masterService.service,
      durationOverrideMin: input.masterService.durationOverrideMin ?? null,
    };
  }
  if (input.service) {
    return {
      service: input.service,
      durationOverrideMin: null,
    };
  }
  return null;
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
      OR: [
        {
          masterService: {
            is: {
              service: {
                globalCategoryId: { in: categoryIds },
              },
            },
          },
        },
        {
          service: {
            is: {
              globalCategoryId: { in: categoryIds },
            },
          },
        },
      ],
    });
  }

  const serviceQuery = input.serviceQuery?.trim();
  if (serviceQuery) {
    and.push({
      OR: [
        {
          masterService: {
            is: {
              service: {
                OR: [
                  { name: { contains: serviceQuery, mode: "insensitive" } },
                  { title: { contains: serviceQuery, mode: "insensitive" } },
                  { category: { is: { title: { contains: serviceQuery, mode: "insensitive" } } } },
                ],
              },
            },
          },
        },
        {
          service: {
            is: {
              OR: [
                { name: { contains: serviceQuery, mode: "insensitive" } },
                { title: { contains: serviceQuery, mode: "insensitive" } },
                { category: { is: { title: { contains: serviceQuery, mode: "insensitive" } } } },
              ],
            },
          },
        },
      ],
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

  const cursorId = input.cursor ? decodeCursor(input.cursor) : null;
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
  });

  const hasMore = offers.length > take;
  const rows = hasMore ? offers.slice(0, -1) : offers;

  // TODO: inline into the select above after `npx prisma generate` for migration 20260411180000
  const offerIds = rows.map((o) => o.id);
  const codeRows = offerIds.length
    ? await prisma.$queryRaw<Array<{ id: string; publicCode: string }>>`
        SELECT id, "publicCode" FROM "ModelOffer" WHERE id = ANY(${offerIds})`
    : [];
  const publicCodeMap = new Map(codeRows.map((r) => [r.id, r.publicCode]));

  const items: CatalogModelOfferItem[] = rows
    .map((offer) => {
      const offerService = resolveModelOfferService({
        masterService: offer.masterService,
        service: offer.service,
      });
      if (!offerService) return null;
      const service = offerService.service;
      const publicCode = publicCodeMap.get(offer.id);
      if (!publicCode) return null;
      return {
        type: "modelOffer",
        publicCode,
        masterName: offer.master?.name ?? "Master",
        masterAvatarUrl: offer.master?.avatarUrl ?? null,
        masterPublicUsername: offer.master?.publicUsername ?? null,
        serviceTitle: service.title?.trim() || service.name,
        categoryTitle: service.category?.title ?? null,
        durationMin: resolveOfferDuration({
          durationOverrideMin: offerService.durationOverrideMin ?? null,
          baseDurationMin: service.baseDurationMin ?? null,
          durationMin: service.durationMin,
        }),
        dateLocal: offer.dateLocal,
        timeRangeStartLocal: offer.timeRangeStartLocal,
        timeRangeEndLocal: offer.timeRangeEndLocal,
        price: toPriceNumber(offer.price),
        requirements: offer.requirements,
      };
    })
    .filter((item): item is CatalogModelOfferItem => Boolean(item));

  return {
    items,
    nextCursor: hasMore ? encodeCursor(rows[rows.length - 1]!.id) : null,
  };
}

