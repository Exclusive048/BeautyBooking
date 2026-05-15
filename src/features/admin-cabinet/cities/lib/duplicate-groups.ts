import { normalizeCityName } from "@/lib/cities/normalize";
import { haversineKm } from "@/features/admin-cabinet/cities/lib/haversine";
import { getCityTag } from "@/features/admin-cabinet/cities/lib/city-tags";
import type {
  AdminDuplicateGroup,
  AdminDuplicateGroupCity,
  AdminDuplicateReason,
} from "@/features/admin-cabinet/cities/types";

/**
 * Pure logic for finding duplicate city groups. Lives in `/lib/` so it
 * stays importable from both server (for `/api/admin/cities/duplicates`)
 * and client (for client-side previews / tests) without dragging Prisma.
 */

const GEO_THRESHOLD_KM = 5;

/** Minimal shape required to build a duplicate group. Server passes
 * Prisma rows + computed counts; tests can pass POJOs. */
export type DuplicateInputCity = {
  id: string;
  slug: string;
  name: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  autoCreated: boolean;
  mastersCount: number;
  studiosCount: number;
};

type WorkingGroup = {
  reason: AdminDuplicateReason;
  cityIds: Set<string>;
};

/** Stable group id = "{reason}:{sortedIds-join-comma}". Same set of
 * cities always yields the same id regardless of insertion order. */
function buildGroupId(reason: AdminDuplicateReason, ids: string[]): string {
  return `${reason}:${[...ids].sort().join(",")}`;
}

/** Picks the "canonical" city in a group:
 *   1. Manual (autoCreated=false) wins over auto-created.
 *   2. If tied, the one with more (masters + studios) wins.
 *   3. If still tied, the earliest-created (smallest id by lex) wins —
 *      `id` is a cuid so this is monotonic with creation time.
 */
function pickCanonicalId(cities: DuplicateInputCity[]): string {
  let best: DuplicateInputCity = cities[0]!;
  for (const c of cities.slice(1)) {
    const bestManual = !best.autoCreated;
    const cManual = !c.autoCreated;
    if (cManual !== bestManual) {
      if (cManual) best = c;
      continue;
    }
    const bestPop = best.mastersCount + best.studiosCount;
    const cPop = c.mastersCount + c.studiosCount;
    if (cPop !== bestPop) {
      if (cPop > bestPop) best = c;
      continue;
    }
    if (c.id < best.id) best = c;
  }
  return best.id;
}

/**
 * Detects duplicate city groups.
 *
 * Pass 1 — exact normalize match (`normalizeCityName(a) === normalizeCityName(b)`).
 *   Catches: trailing space, "г. Москва" prefix, ", Россия" tail.
 * Pass 2 — coordinate proximity (`haversineKm(a, b) < 5`).
 *   Catches: typo'd names that geocoded to roughly the same coords
 *   (e.g. "Нижний-Новгород" with a hyphen vs "Нижний Новгород").
 *
 * If a pair is flagged by both passes we keep `reason: "normalize"`
 * (the stronger signal). Same city can appear in only one group at a
 * time — passes process in order and pass 2 skips ids already grouped.
 */
export function findDuplicateGroups(
  cities: DuplicateInputCity[],
): AdminDuplicateGroup[] {
  const byNormalized = new Map<string, DuplicateInputCity[]>();
  for (const city of cities) {
    const key = normalizeCityName(city.name).toLowerCase();
    const bucket = byNormalized.get(key) ?? [];
    bucket.push(city);
    byNormalized.set(key, bucket);
  }

  const grouped = new Set<string>();
  const working: WorkingGroup[] = [];

  for (const bucket of byNormalized.values()) {
    if (bucket.length < 2) continue;
    const ids = new Set(bucket.map((c) => c.id));
    for (const id of ids) grouped.add(id);
    working.push({ reason: "normalize", cityIds: ids });
  }

  // Pass 2 — pairwise proximity on cities not already grouped. O(n²) but
  // n is small (typically < 100 cities) and we only run when invalidated.
  const ungrouped = cities.filter((c) => !grouped.has(c.id));
  for (let i = 0; i < ungrouped.length; i += 1) {
    const a = ungrouped[i]!;
    if (grouped.has(a.id)) continue;
    const cluster = new Set<string>([a.id]);
    for (let j = i + 1; j < ungrouped.length; j += 1) {
      const b = ungrouped[j]!;
      if (grouped.has(b.id)) continue;
      if (haversineKm(a, b) < GEO_THRESHOLD_KM) {
        cluster.add(b.id);
      }
    }
    if (cluster.size >= 2) {
      for (const id of cluster) grouped.add(id);
      working.push({ reason: "geo", cityIds: cluster });
    }
  }

  // Materialise into final shape.
  const cityById = new Map(cities.map((c) => [c.id, c]));
  return working.map(({ reason, cityIds }) => {
    const inGroup = [...cityIds]
      .map((id) => cityById.get(id))
      .filter((c): c is DuplicateInputCity => !!c);
    const canonicalId = pickCanonicalId(inGroup);
    const groupCities: AdminDuplicateGroupCity[] = inGroup.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      tag: getCityTag(c.slug),
      autoCreated: c.autoCreated,
      isActive: c.isActive,
      mastersCount: c.mastersCount,
      studiosCount: c.studiosCount,
      isCanonical: c.id === canonicalId,
    }));
    return {
      groupId: buildGroupId(reason, [...cityIds]),
      reason,
      cities: groupCities,
    };
  });
}

/** Convenience map for stitching `duplicateGroupId` onto list rows. */
export function buildDuplicateGroupIndex(
  groups: AdminDuplicateGroup[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const group of groups) {
    for (const c of group.cities) {
      index.set(c.id, group.groupId);
    }
  }
  return index;
}
