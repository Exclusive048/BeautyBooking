import type {
  AccountType,
  PlanTier,
  SubscriptionScope,
  SubscriptionStatus,
} from "@prisma/client";

/** UI-side role grouping for the 5-tile filter strip. Maps onto the
 * 6 raw `AccountType` values per `lib/role-grouping.ts`. */
export type AdminUserRoleGroup = "all" | "client" | "master" | "studio" | "admin";

/** Plan-tier filter — null when admin hasn't filtered on tier. The
 * filter dropdown ships `all` as a sentinel; converted to `null` for
 * the service layer. */
export type AdminUserPlanFilter = "all" | "free" | "pro" | "premium";

export type AdminUserPlanSnapshot = {
  planId: string;
  planCode: string;
  planName: string;
  tier: PlanTier;
  scope: SubscriptionScope;
  status: SubscriptionStatus;
  isTrial: boolean;
  currentPeriodEnd: string | null;
};

export type AdminUserRow = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  roles: AccountType[];
  /** Highest-privilege role on the user — SUPERADMIN beats ADMIN beats
   * STUDIO beats STUDIO_ADMIN beats MASTER beats CLIENT. */
  primaryRole: AccountType;
  /** Active subscription for the user's MASTER or STUDIO scope, or
   * `null` for CLIENT / ADMIN / SUPERADMIN. When the user has both
   * scopes (rare: a master who also owns a studio) we expose the
   * scope that matches `primaryRole`. */
  plan: AdminUserPlanSnapshot | null;
  /** Resolved through any Provider linked to the user. `null` for
   * CLIENT and admin rows. */
  cityName: string | null;
  createdAt: string;
};

export type AdminUserCounts = {
  all: number;
  client: number;
  master: number;
  studio: number;
  admin: number;
};

export type AdminUserListResponse = {
  users: AdminUserRow[];
  counts: AdminUserCounts;
  nextCursor: string | null;
};

export type AdminBillingPlanOption = {
  id: string;
  code: string;
  name: string;
  tier: PlanTier;
  scope: SubscriptionScope;
};
