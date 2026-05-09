import { CategoryStatus, ProviderType } from "@prisma/client";
import { getMasterContext } from "@/lib/master/profile.service";
import { prisma } from "@/lib/prisma";

/**
 * Server aggregator for `/cabinet/master/portfolio` (31b).
 *
 * Returns everything the page needs in one round-trip:
 *  - filtered + ordered items (driven by `?filter=` and `?cat=`)
 *  - KPI counts (always full-population, never affected by current filter)
 *  - filter chip counts per visibility bucket
 *  - dropdown options: master's enabled services, available global
 *    categories, and the master's previously-used tags (for the edit
 *    modal's autocomplete).
 *
 * Visibility — uses `isPublic` as the catalog flag (per audit). The
 * orthogonal `inSearch` flag stays out of the UI.
 */

export type PortfolioFilterId = "all" | "public" | "hidden";

const VALID_FILTERS: ReadonlySet<PortfolioFilterId> = new Set(["all", "public", "hidden"]);

export function parsePortfolioFilter(value: string | null | undefined): PortfolioFilterId {
  if (value && VALID_FILTERS.has(value as PortfolioFilterId)) {
    return value as PortfolioFilterId;
  }
  return "all";
}

export type PortfolioItemView = {
  id: string;
  mediaUrl: string;
  /** Parsed from mediaUrl when path matches `/api/media/file/{id}/...`.
   * UI uses it for the crop endpoint; null when the item was created via
   * a raw URL upload (rare; old data path). */
  mediaAssetId: string | null;
  isPublic: boolean;
  globalCategoryId: string | null;
  globalCategoryName: string | null;
  serviceIds: string[];
  tagIds: string[];
  tagNames: string[];
  sortOrder: number;
  createdAt: string;
  /** Position in the master's full (unfiltered) list, ordered the same
   * way the page paints. UI uses this for reorder boundary detection so
   * arrows disable correctly even when a filter is active. */
  globalIndex: number;
  /** Total count of the master's portfolio (also unfiltered). Saves the
   * UI another lookup when computing `isLast`. */
  globalCount: number;
};

export type PortfolioKpi = {
  totalCount: number;
  publicCount: number;
  hiddenCount: number;
};

export type PortfolioCategoryOption = {
  id: string;
  name: string;
};

export type PortfolioServiceOption = {
  id: string;
  name: string;
};

export type PortfolioTagOption = {
  id: string;
  name: string;
};

export type MasterPortfolioViewData = {
  providerId: string;
  items: PortfolioItemView[];
  kpi: PortfolioKpi;
  filterCounts: Record<PortfolioFilterId, number>;
  /** Categories that have at least one portfolio item in this master's
   * full population — used for the secondary chip row. */
  categoriesUsed: PortfolioCategoryOption[];
  /** Full categories list — populates the edit/upload modal's category
   * select. Includes master-proposed/created categories on top of the
   * approved-and-public ones. */
  categoriesAll: PortfolioCategoryOption[];
  services: PortfolioServiceOption[];
  /** Master's previously-used tags — tag-input autocomplete. New-tag
   * creation is not in 31b scope. */
  masterTags: PortfolioTagOption[];
  activeFilter: PortfolioFilterId;
  activeCategoryId: string | null;
};

const MEDIA_FILE_PATH_PREFIX = "/api/media/file/";

function extractMediaAssetIdFromUrl(mediaUrl: string): string | null {
  // Same shape as the helper in profile.service.ts — duplicated here to
  // keep the view-service self-contained.
  try {
    const parsed = new URL(mediaUrl, "http://placeholder.local");
    if (!parsed.pathname.startsWith(MEDIA_FILE_PATH_PREFIX)) return null;
    const id = parsed.pathname.slice(MEDIA_FILE_PATH_PREFIX.length).split("/")[0];
    return id || null;
  } catch {
    return null;
  }
}

export async function getMasterPortfolioView(input: {
  userId: string;
  filter: PortfolioFilterId;
  categoryId: string | null;
}): Promise<MasterPortfolioViewData | null> {
  const provider = await prisma.provider.findFirst({
    where: { ownerUserId: input.userId, type: ProviderType.MASTER },
    select: { id: true, ownerUserId: true },
    orderBy: { createdAt: "asc" },
  });
  if (!provider) return null;

  const context = await getMasterContext(provider.id);
  const providerScope = context.isSolo ? provider.id : context.studioProviderId!;

  const [allItems, masterTagsRows, categoriesAll, services] = await Promise.all([
    prisma.portfolioItem.findMany({
      where: { masterId: provider.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      include: {
        services: { select: { serviceId: true } },
        tags: { select: { tagId: true, tag: { select: { name: true } } } },
        globalCategory: { select: { id: true, name: true } },
      },
    }),
    prisma.portfolioItemTag.findMany({
      where: { portfolioItem: { masterId: provider.id } },
      select: { tag: { select: { id: true, name: true } } },
      distinct: ["tagId"],
    }),
    listAvailableGlobalCategories(provider.ownerUserId),
    prisma.service.findMany({
      where: { providerId: providerScope, isEnabled: true, isActive: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, title: true },
    }),
  ]);

  const kpi: PortfolioKpi = {
    totalCount: allItems.length,
    publicCount: allItems.filter((item) => item.isPublic).length,
    hiddenCount: allItems.filter((item) => !item.isPublic).length,
  };
  const filterCounts: Record<PortfolioFilterId, number> = {
    all: kpi.totalCount,
    public: kpi.publicCount,
    hidden: kpi.hiddenCount,
  };

  const categoriesUsedMap = new Map<string, PortfolioCategoryOption>();
  for (const item of allItems) {
    if (item.globalCategory) {
      categoriesUsedMap.set(item.globalCategory.id, {
        id: item.globalCategory.id,
        name: item.globalCategory.name,
      });
    }
  }
  const categoriesUsed = Array.from(categoriesUsedMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name, "ru")
  );

  const filtered = allItems.filter((item) => {
    if (input.filter === "public" && !item.isPublic) return false;
    if (input.filter === "hidden" && item.isPublic) return false;
    if (input.categoryId && item.globalCategoryId !== input.categoryId) return false;
    return true;
  });

  const globalIndexById = new Map<string, number>();
  allItems.forEach((item, index) => globalIndexById.set(item.id, index));

  const items: PortfolioItemView[] = filtered.map((item) => ({
    id: item.id,
    mediaUrl: item.mediaUrl,
    mediaAssetId: extractMediaAssetIdFromUrl(item.mediaUrl),
    isPublic: item.isPublic,
    globalCategoryId: item.globalCategoryId,
    globalCategoryName: item.globalCategory?.name ?? null,
    serviceIds: item.services.map((row) => row.serviceId),
    tagIds: item.tags.map((row) => row.tagId),
    tagNames: item.tags.map((row) => row.tag.name),
    sortOrder: item.sortOrder,
    createdAt: item.createdAt.toISOString(),
    globalIndex: globalIndexById.get(item.id) ?? 0,
    globalCount: allItems.length,
  }));

  return {
    providerId: provider.id,
    items,
    kpi,
    filterCounts,
    categoriesUsed,
    categoriesAll,
    services: services.map((service) => ({
      id: service.id,
      name: service.title?.trim() || service.name,
    })),
    masterTags: masterTagsRows
      .map((row) => ({ id: row.tag.id, name: row.tag.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "ru")),
    activeFilter: input.filter,
    activeCategoryId: input.categoryId,
  };
}

async function listAvailableGlobalCategories(
  ownerUserId: string | null
): Promise<PortfolioCategoryOption[]> {
  // Mirrors the visibility rules used by createMasterPortfolioItem so
  // master can't pick a category they wouldn't be allowed to attach.
  // Excludes the synthetic "hot" visualSearchSlug bucket.
  const rows = await prisma.globalCategory.findMany({
    where: {
      visualSearchSlug: { not: "hot" },
      OR: [
        { status: CategoryStatus.APPROVED, visibleToAll: true },
        ...(ownerUserId
          ? [
              { createdByUserId: ownerUserId },
              { proposedBy: ownerUserId },
            ]
          : []),
      ],
    },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}
