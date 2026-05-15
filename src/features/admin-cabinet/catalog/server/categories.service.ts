import "server-only";

import { CategoryStatus, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AdminCategoryCounts,
  AdminCategoryParentOption,
  AdminCategoryRow,
  AdminCategoryStatus,
  AdminCategoryStatusFilter,
} from "@/features/admin-cabinet/catalog/types";

type ListOpts = {
  status?: AdminCategoryStatusFilter;
  /** `string` — filter by exact parent id; `"root"` — only root
   * categories (parentId IS NULL); `undefined` or `"all"` — no
   * parent filter. */
  parent?: string | "root" | "all";
  /** Free-text needle for case-insensitive `name` match. */
  search?: string;
};

const STATUS_BY_FILTER: Record<AdminCategoryStatusFilter, CategoryStatus | null> = {
  all: null,
  pending: CategoryStatus.PENDING,
  approved: CategoryStatus.APPROVED,
  rejected: CategoryStatus.REJECTED,
};

/** Sort priority used when no other tiebreaker applies: PENDING rows
 * float to the top so moderation work doesn't get buried under a
 * mountain of APPROVED categories. */
function statusOrderValue(status: CategoryStatus): number {
  if (status === CategoryStatus.PENDING) return 0;
  if (status === CategoryStatus.APPROVED) return 1;
  return 2;
}

function buildWhere(opts: ListOpts): Prisma.GlobalCategoryWhereInput {
  const where: Prisma.GlobalCategoryWhereInput = {};
  const status = STATUS_BY_FILTER[opts.status ?? "all"];
  if (status) where.status = status;
  if (opts.parent === "root") {
    where.parentId = null;
  } else if (opts.parent && opts.parent !== "all") {
    where.parentId = opts.parent;
  }
  const needle = opts.search?.trim();
  if (needle) {
    where.name = { contains: needle, mode: "insensitive" };
  }
  return where;
}

/**
 * Lists categories for the admin moderation table.
 *
 * For each row we compute two derived counts that aren't denormalised
 * on `GlobalCategory`:
 *   - `servicesCount` — total `Service` rows in the category
 *   - `providersCount` — distinct providers offering ≥1 service
 *
 * We compute them in a single round-trip per metric using `groupBy`,
 * which is cheaper than N+1 `count()` calls per row. The intermediate
 * counts are stitched back onto the category rows in JS.
 */
export async function listAdminCategories(
  opts: ListOpts = {},
): Promise<AdminCategoryRow[]> {
  const where = buildWhere(opts);

  const rows = await prisma.globalCategory.findMany({
    where,
    orderBy: [{ name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      isSystem: true,
      parentId: true,
      createdAt: true,
      parent: { select: { id: true, name: true } },
      proposedBy: true,
    },
  });

  const ids = rows.map((r) => r.id);
  const proposerIds = rows
    .map((r) => r.proposedBy)
    .filter((v): v is string => !!v);

  // Service counts per category, in a single grouped query.
  const serviceCounts =
    ids.length === 0
      ? []
      : await prisma.service.groupBy({
          by: ["globalCategoryId"],
          where: { globalCategoryId: { in: ids } },
          _count: { _all: true },
        });
  const servicesByCategory = new Map<string, number>();
  for (const row of serviceCounts) {
    if (row.globalCategoryId) {
      servicesByCategory.set(row.globalCategoryId, row._count._all);
    }
  }

  // Distinct providers per category — group by (categoryId, providerId)
  // then bucket in JS. Avoids `DISTINCT` aggregate which Prisma doesn't
  // expose cleanly for groupBy.
  const providerCatPairs =
    ids.length === 0
      ? []
      : await prisma.service.groupBy({
          by: ["globalCategoryId", "providerId"],
          where: { globalCategoryId: { in: ids } },
        });
  const providersByCategory = new Map<string, number>();
  for (const row of providerCatPairs) {
    if (!row.globalCategoryId) continue;
    providersByCategory.set(
      row.globalCategoryId,
      (providersByCategory.get(row.globalCategoryId) ?? 0) + 1,
    );
  }

  // Resolve proposer display names in one query.
  const proposers =
    proposerIds.length === 0
      ? []
      : await prisma.userProfile.findMany({
          where: { id: { in: proposerIds } },
          select: { id: true, displayName: true },
        });
  const proposerById = new Map(proposers.map((p) => [p.id, p]));

  const mapped: AdminCategoryRow[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    status: r.status as AdminCategoryStatus,
    parent: r.parent ? { id: r.parent.id, name: r.parent.name } : null,
    servicesCount: servicesByCategory.get(r.id) ?? 0,
    providersCount: providersByCategory.get(r.id) ?? 0,
    isSystem: r.isSystem,
    createdAt: r.createdAt.toISOString(),
    proposer: r.proposedBy
      ? {
          id: r.proposedBy,
          displayName: proposerById.get(r.proposedBy)?.displayName ?? null,
        }
      : null,
  }));

  // Sort: PENDING first (so moderation is visible), then by name. The
  // initial `orderBy: name` above is preserved within each status
  // group thanks to `Array.sort` being stable.
  mapped.sort((a, b) => statusOrderValue(a.status as CategoryStatus) - statusOrderValue(b.status as CategoryStatus));

  return mapped;
}

/** Counts per status filter — drives the count badges in the tab bar.
 * Single grouped query, no scan-per-tab. */
export async function getCategoryCounts(): Promise<AdminCategoryCounts> {
  const grouped = await prisma.globalCategory.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: AdminCategoryCounts = {
    all: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  };
  for (const row of grouped) {
    counts.all += row._count._all;
    if (row.status === CategoryStatus.PENDING) counts.pending = row._count._all;
    else if (row.status === CategoryStatus.APPROVED)
      counts.approved = row._count._all;
    else if (row.status === CategoryStatus.REJECTED)
      counts.rejected = row._count._all;
  }
  return counts;
}

/** Parent-category options for the filter dropdown and the create /
 * edit dialogs. Only APPROVED + non-system categories are eligible
 * parents — pending or rejected categories shouldn't shape the tree. */
export async function listParentOptions(): Promise<AdminCategoryParentOption[]> {
  const rows = await prisma.globalCategory.findMany({
    where: { status: CategoryStatus.APPROVED },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true },
  });
  return rows.map((r) => ({ id: r.id, name: r.name }));
}
