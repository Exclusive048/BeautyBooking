import "server-only";

import { ProviderType, type Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findDuplicateGroups, buildDuplicateGroupIndex } from "@/features/admin-cabinet/cities/lib/duplicate-groups";
import { getCityTag } from "@/features/admin-cabinet/cities/lib/city-tags";
import type {
  AdminCitiesCounts,
  AdminCityRow,
  AdminCityStatusFilter,
  AdminDuplicateGroup,
} from "@/features/admin-cabinet/cities/types";

type ListOpts = {
  status?: AdminCityStatusFilter;
  search?: string;
};

/**
 * Lists cities for the admin moderation surface. Computes:
 *   - per-row `mastersCount` / `studiosCount` (split by Provider.type)
 *   - per-row `providersCount` (kept for backwards-compat with the
 *     legacy AdminCities UI that still reads this field)
 *   - per-row `duplicateGroupId` (null when the city isn't in any group)
 *   - per-row `tag` (display-only, from `getCityTag(slug)`)
 *
 * Counts include **all** providers regardless of `isPublished` — admins
 * need to see the real distribution, not just what's surfaced publicly.
 *
 * Filters:
 *   - `status` — all / visible / hidden / dup (driven by URL state)
 *   - `search` — case-insensitive `name` match
 *
 * Sort: PENDING moderation surface first (autoCreated DESC), then by
 * name asc. Matches the legacy AdminCities ordering.
 */
export async function listAdminCities(
  opts: ListOpts = {},
): Promise<{ rows: AdminCityRow[]; duplicateGroups: AdminDuplicateGroup[] }> {
  const status = opts.status ?? "all";

  const where: Prisma.CityWhereInput = {};
  if (status === "visible") where.isActive = true;
  if (status === "hidden") where.isActive = false;
  // status === "dup" filtered in-memory after computing groups.
  const needle = opts.search?.trim();
  if (needle) {
    where.name = { contains: needle, mode: "insensitive" };
  }

  const rows = await prisma.city.findMany({
    where,
    orderBy: [{ autoCreated: "desc" }, { name: "asc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      nameGenitive: true,
      latitude: true,
      longitude: true,
      timezone: true,
      isActive: true,
      sortOrder: true,
      autoCreated: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const ids = rows.map((r) => r.id);
  const grouped =
    ids.length === 0
      ? []
      : await prisma.provider.groupBy({
          by: ["cityId", "type"],
          where: { cityId: { in: ids } },
          _count: { _all: true },
        });

  type Counts = { masters: number; studios: number };
  const countsById = new Map<string, Counts>();
  for (const g of grouped) {
    if (!g.cityId) continue;
    const bucket = countsById.get(g.cityId) ?? { masters: 0, studios: 0 };
    if (g.type === ProviderType.MASTER) bucket.masters += g._count._all;
    else if (g.type === ProviderType.STUDIO) bucket.studios += g._count._all;
    countsById.set(g.cityId, bucket);
  }

  // Duplicate detection needs all rows (not just the filtered subset) so
  // a "hidden" duplicate of a "visible" city still surfaces. So we do a
  // second, status-agnostic fetch when the user is filtering — cheap
  // because the City table is small.
  const fullRows =
    status === "all" && !needle
      ? rows
      : await prisma.city.findMany({
          orderBy: [{ name: "asc" }],
          select: {
            id: true,
            slug: true,
            name: true,
            latitude: true,
            longitude: true,
            isActive: true,
            autoCreated: true,
          },
        });

  // Recompute counts for full set if needed (cheap).
  const fullIds = fullRows.map((r) => r.id);
  const fullGrouped =
    fullIds.length === 0
      ? []
      : status === "all" && !needle
        ? grouped // reuse
        : await prisma.provider.groupBy({
            by: ["cityId", "type"],
            where: { cityId: { in: fullIds } },
            _count: { _all: true },
          });
  const fullCounts = new Map<string, Counts>();
  for (const g of fullGrouped) {
    if (!g.cityId) continue;
    const bucket = fullCounts.get(g.cityId) ?? { masters: 0, studios: 0 };
    if (g.type === ProviderType.MASTER) bucket.masters += g._count._all;
    else if (g.type === ProviderType.STUDIO) bucket.studios += g._count._all;
    fullCounts.set(g.cityId, bucket);
  }

  const duplicateGroups = findDuplicateGroups(
    fullRows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      isActive: r.isActive,
      autoCreated: r.autoCreated,
      mastersCount: fullCounts.get(r.id)?.masters ?? 0,
      studiosCount: fullCounts.get(r.id)?.studios ?? 0,
    })),
  );
  const groupIndex = buildDuplicateGroupIndex(duplicateGroups);

  let mapped: AdminCityRow[] = rows.map((r) => {
    const c = countsById.get(r.id) ?? { masters: 0, studios: 0 };
    return {
      id: r.id,
      slug: r.slug,
      name: r.name,
      nameGenitive: r.nameGenitive,
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone,
      isActive: r.isActive,
      sortOrder: r.sortOrder,
      autoCreated: r.autoCreated,
      providersCount: c.masters + c.studios,
      mastersCount: c.masters,
      studiosCount: c.studios,
      duplicateGroupId: groupIndex.get(r.id) ?? null,
      tag: getCityTag(r.slug),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });

  if (status === "dup") {
    mapped = mapped.filter((row) => row.duplicateGroupId !== null);
  }

  return { rows: mapped, duplicateGroups };
}

export async function getCitiesCounts(): Promise<AdminCitiesCounts> {
  const rows = await prisma.city.findMany({
    select: {
      id: true,
      slug: true,
      name: true,
      latitude: true,
      longitude: true,
      isActive: true,
      autoCreated: true,
    },
  });

  const grouped =
    rows.length === 0
      ? []
      : await prisma.provider.groupBy({
          by: ["cityId", "type"],
          where: { cityId: { in: rows.map((r) => r.id) } },
          _count: { _all: true },
        });
  const countsById = new Map<string, { masters: number; studios: number }>();
  for (const g of grouped) {
    if (!g.cityId) continue;
    const bucket = countsById.get(g.cityId) ?? { masters: 0, studios: 0 };
    if (g.type === ProviderType.MASTER) bucket.masters += g._count._all;
    else if (g.type === ProviderType.STUDIO) bucket.studios += g._count._all;
    countsById.set(g.cityId, bucket);
  }

  const groups = findDuplicateGroups(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      isActive: r.isActive,
      autoCreated: r.autoCreated,
      mastersCount: countsById.get(r.id)?.masters ?? 0,
      studiosCount: countsById.get(r.id)?.studios ?? 0,
    })),
  );
  const inGroup = new Set<string>();
  for (const g of groups) for (const c of g.cities) inGroup.add(c.id);

  let visible = 0;
  for (const r of rows) if (r.isActive) visible += 1;
  return {
    all: rows.length,
    visible,
    hidden: rows.length - visible,
    dup: inGroup.size,
  };
}

export async function getProvidersWithoutCityCount(): Promise<number> {
  return prisma.provider.count({ where: { cityId: null } });
}
