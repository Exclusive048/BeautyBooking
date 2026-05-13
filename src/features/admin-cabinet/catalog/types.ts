/**
 * Plain-data types for the admin catalog moderation surface. Shared
 * between the server service (`./server/categories.service.ts`) and
 * the client components — only primitives + null, safe across the RSC
 * boundary via `import type`.
 */

export type AdminCategoryStatus = "PENDING" | "APPROVED" | "REJECTED";

export type AdminCategoryStatusFilter = "all" | "pending" | "approved" | "rejected";

export type AdminCategoryParent = {
  id: string;
  name: string;
};

/** Lightweight "who first proposed this category" — sourced from
 * `GlobalCategory.proposedBy` (UserProfile.id). `null` when the
 * category was created directly by an admin (no proposer). */
export type AdminCategoryProposer = {
  id: string;
  displayName: string | null;
};

export type AdminCategoryRow = {
  id: string;
  name: string;
  slug: string;
  status: AdminCategoryStatus;
  parent: AdminCategoryParent | null;
  /** Count of `Service` rows referencing this category. */
  servicesCount: number;
  /** Count of **distinct** providers that have at least one service
   * in this category. Communicates "popularity" better than a raw
   * service count, which can inflate when a single provider lists
   * many micro-variants. */
  providersCount: number;
  isSystem: boolean;
  /** ISO timestamp. */
  createdAt: string;
  proposer: AdminCategoryProposer | null;
};

export type AdminCategoryCounts = {
  all: number;
  pending: number;
  approved: number;
  rejected: number;
};

/** Trimmed payload for the parent-category dropdown in filters &
 * dialogs — we only need id + name, never the full row. */
export type AdminCategoryParentOption = {
  id: string;
  name: string;
};
