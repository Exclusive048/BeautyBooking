import "server-only";

import { ProviderType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { findDuplicateGroups } from "@/features/admin-cabinet/cities/lib/duplicate-groups";
import type { AdminDuplicateGroup } from "@/features/admin-cabinet/cities/types";

/**
 * Standalone duplicate-group fetcher used by the
 * `GET /api/admin/cities/duplicates` endpoint and the
 * `<DuplicateGroupsModal>` overview.
 *
 * Logic is identical to what `cities.service.ts` does in-line for the
 * list-with-counts response — extracted here so the duplicates modal
 * doesn't have to re-fetch and re-derive every time it opens.
 */
export async function getAdminDuplicateGroups(): Promise<AdminDuplicateGroup[]> {
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
  if (rows.length === 0) return [];

  const grouped = await prisma.provider.groupBy({
    by: ["cityId", "type"],
    where: { cityId: { in: rows.map((r) => r.id) } },
    _count: { _all: true },
  });
  const counts = new Map<string, { masters: number; studios: number }>();
  for (const g of grouped) {
    if (!g.cityId) continue;
    const bucket = counts.get(g.cityId) ?? { masters: 0, studios: 0 };
    if (g.type === ProviderType.MASTER) bucket.masters += g._count._all;
    else if (g.type === ProviderType.STUDIO) bucket.studios += g._count._all;
    counts.set(g.cityId, bucket);
  }

  return findDuplicateGroups(
    rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      isActive: r.isActive,
      autoCreated: r.autoCreated,
      mastersCount: counts.get(r.id)?.masters ?? 0,
      studiosCount: counts.get(r.id)?.studios ?? 0,
    })),
  );
}
