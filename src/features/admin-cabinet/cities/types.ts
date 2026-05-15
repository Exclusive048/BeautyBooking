/**
 * Plain-data types for the admin cities surface. Shared between server
 * services (`./server/*`) and client components — primitives + null only,
 * safe to `import type` from either side of the RSC boundary.
 */

export type AdminCityStatusFilter = "all" | "visible" | "hidden" | "dup";

export type AdminCityRow = {
  id: string;
  slug: string;
  name: string;
  nameGenitive: string | null;
  latitude: number;
  longitude: number;
  timezone: string;
  isActive: boolean;
  sortOrder: number;
  autoCreated: boolean;
  /** Provider count, all types (Master + Studio), all isPublished states.
   * Kept for legacy AdminCities backwards-compat — the new UI uses the
   * split `mastersCount` / `studiosCount` instead. */
  providersCount: number;
  mastersCount: number;
  studiosCount: number;
  /** Composite id of the duplicate group this city belongs to, or null. */
  duplicateGroupId: string | null;
  /** Pre-computed 2-4 letter tag, hard-coded for top-30 RU cities and
   * derived from `slug` otherwise. Display-only — not persisted. */
  tag: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminCitiesCounts = {
  all: number;
  visible: number;
  hidden: number;
  dup: number;
};

export type AdminDuplicateReason = "normalize" | "geo";

export type AdminDuplicateGroupCity = {
  id: string;
  name: string;
  slug: string;
  tag: string;
  autoCreated: boolean;
  isActive: boolean;
  mastersCount: number;
  studiosCount: number;
  isCanonical: boolean;
};

export type AdminDuplicateGroup = {
  groupId: string;
  reason: AdminDuplicateReason;
  cities: AdminDuplicateGroupCity[];
};
