import "server-only";

import {
  AccountType,
  PlanTier,
  SubscriptionScope,
  type Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolvePrimaryRole } from "@/features/admin-cabinet/users/lib/primary-role";
import { ROLE_GROUP_ACCOUNT_TYPES } from "@/features/admin-cabinet/users/lib/role-grouping";
import type {
  AdminBillingPlanOption,
  AdminUserCounts,
  AdminUserListResponse,
  AdminUserPlanFilter,
  AdminUserPlanSnapshot,
  AdminUserRoleGroup,
  AdminUserRow,
} from "@/features/admin-cabinet/users/types";

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;

type ListOpts = {
  roleGroup?: AdminUserRoleGroup;
  planTier?: AdminUserPlanFilter;
  search?: string;
  cursor?: string | null;
  pageSize?: number;
};

function buildRoleWhere(group: AdminUserRoleGroup): Prisma.UserProfileWhereInput | undefined {
  if (group === "all") return undefined;
  const accountTypes = ROLE_GROUP_ACCOUNT_TYPES[group];
  return {
    OR: accountTypes.map((role) => ({ roles: { has: role } })),
  };
}

function buildSearchWhere(needle: string): Prisma.UserProfileWhereInput {
  return {
    OR: [
      { displayName: { contains: needle, mode: "insensitive" } },
      { phone: { contains: needle } },
      { email: { contains: needle, mode: "insensitive" } },
    ],
  };
}

function planTierToPrisma(tier: AdminUserPlanFilter): PlanTier | null {
  if (tier === "free") return PlanTier.FREE;
  if (tier === "pro") return PlanTier.PRO;
  if (tier === "premium") return PlanTier.PREMIUM;
  return null;
}

/** Resolves a user's display name to a non-empty string. Falls back
 * to email → phone → "—" so the admin UI never shows an empty cell. */
function resolveDisplayName(user: {
  displayName: string | null;
  email: string | null;
  phone: string | null;
}): string {
  return (
    user.displayName?.trim() ||
    user.email?.trim() ||
    user.phone?.trim() ||
    "—"
  );
}

/**
 * Picks the subscription that matches the user's primary role:
 *   - MASTER → first MASTER-scope subscription
 *   - STUDIO / STUDIO_ADMIN → first STUDIO-scope subscription
 *   - other primary roles → null (CLIENT / ADMIN have no plan pill)
 *
 * A user could in theory hold both MASTER and STUDIO subscriptions
 * (e.g. a master who later opens a studio). We surface the one
 * tied to the displayed role.
 */
function pickPlan(
  primaryRole: AccountType,
  subscriptions: Array<{
    scope: SubscriptionScope;
    status: AdminUserPlanSnapshot["status"];
    isTrial: boolean;
    currentPeriodEnd: Date | null;
    plan: {
      id: string;
      code: string;
      name: string;
      tier: PlanTier;
      scope: SubscriptionScope;
    };
  }>,
): AdminUserPlanSnapshot | null {
  let preferredScope: SubscriptionScope | null = null;
  if (primaryRole === AccountType.MASTER) {
    preferredScope = SubscriptionScope.MASTER;
  } else if (
    primaryRole === AccountType.STUDIO ||
    primaryRole === AccountType.STUDIO_ADMIN
  ) {
    preferredScope = SubscriptionScope.STUDIO;
  }
  if (!preferredScope) return null;

  const sub = subscriptions.find((s) => s.scope === preferredScope);
  if (!sub) return null;
  return {
    planId: sub.plan.id,
    planCode: sub.plan.code,
    planName: sub.plan.name,
    tier: sub.plan.tier,
    scope: sub.plan.scope,
    status: sub.status,
    isTrial: sub.isTrial,
    currentPeriodEnd: sub.currentPeriodEnd
      ? sub.currentPeriodEnd.toISOString()
      : null,
  };
}

/**
 * Lists users for the admin moderation surface.
 *
 * Filter semantics:
 *   - `roleGroup` — OR across the bundled account types
 *     ("studio" matches STUDIO ∪ STUDIO_ADMIN, etc.)
 *   - `planTier` — filters on `user.subscriptions.some.plan.tier`
 *     — only meaningful for master / studio users, harmless filter
 *     against CLIENT rows (returns none)
 *   - `search` — case-insensitive contains on displayName / email /
 *     trimmed phone
 *
 * City resolve uses `include: providers → city` so we never trigger
 * an N+1 — one query for the user list with relations attached.
 */
export async function listAdminUsers(
  opts: ListOpts = {},
): Promise<AdminUserListResponse> {
  const pageSize = Math.min(
    Math.max(opts.pageSize ?? DEFAULT_PAGE_SIZE, 1),
    MAX_PAGE_SIZE,
  );
  const roleGroup = opts.roleGroup ?? "all";
  const planTier = opts.planTier ?? "all";

  const conditions: Prisma.UserProfileWhereInput[] = [
    { isDeleted: false },
  ];
  const roleWhere = buildRoleWhere(roleGroup);
  if (roleWhere) conditions.push(roleWhere);
  const tier = planTierToPrisma(planTier);
  if (tier) {
    conditions.push({
      subscriptions: { some: { plan: { tier } } },
    });
  }
  const needle = opts.search?.trim();
  if (needle) conditions.push(buildSearchWhere(needle));

  const where: Prisma.UserProfileWhereInput =
    conditions.length === 1 ? conditions[0]! : { AND: conditions };

  const users = await prisma.userProfile.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      displayName: true,
      email: true,
      phone: true,
      roles: true,
      createdAt: true,
      providers: {
        select: {
          city: { select: { name: true } },
        },
        // Avoid pulling the user's entire provider list — first row is
        // enough to resolve the city column. A master/studio admin
        // usually owns one Provider; if they own several we display
        // the first by Prisma's default order (stable enough for
        // admin-UX purposes).
        take: 1,
      },
      subscriptions: {
        select: {
          scope: true,
          status: true,
          isTrial: true,
          currentPeriodEnd: true,
          plan: {
            select: {
              id: true,
              code: true,
              name: true,
              tier: true,
              scope: true,
            },
          },
        },
      },
    },
  });

  const hasMore = users.length > pageSize;
  const page = hasMore ? users.slice(0, pageSize) : users;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  const counts = await getRoleGroupCounts();

  const mapped: AdminUserRow[] = page.map((user) => {
    const primaryRole = resolvePrimaryRole(user.roles);
    return {
      id: user.id,
      displayName: resolveDisplayName(user),
      email: user.email,
      phone: user.phone,
      roles: user.roles,
      primaryRole,
      plan: pickPlan(primaryRole, user.subscriptions),
      cityName: user.providers[0]?.city?.name ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  });

  return { users: mapped, counts, nextCursor };
}

export async function getRoleGroupCounts(): Promise<AdminUserCounts> {
  const baseWhere: Prisma.UserProfileWhereInput = { isDeleted: false };
  // Each count is a separate query — Prisma doesn't expose `count by
  // boolean predicate`. Fine for an admin page; counts are small
  // integers and the table is bounded by user base size.
  const [all, client, master, studio, admin] = await Promise.all([
    prisma.userProfile.count({ where: baseWhere }),
    prisma.userProfile.count({
      where: {
        AND: [baseWhere, { roles: { has: AccountType.CLIENT } }],
      },
    }),
    prisma.userProfile.count({
      where: {
        AND: [baseWhere, { roles: { has: AccountType.MASTER } }],
      },
    }),
    prisma.userProfile.count({
      where: {
        AND: [
          baseWhere,
          {
            OR: [
              { roles: { has: AccountType.STUDIO } },
              { roles: { has: AccountType.STUDIO_ADMIN } },
            ],
          },
        ],
      },
    }),
    prisma.userProfile.count({
      where: {
        AND: [
          baseWhere,
          {
            OR: [
              { roles: { has: AccountType.ADMIN } },
              { roles: { has: AccountType.SUPERADMIN } },
            ],
          },
        ],
      },
    }),
  ]);
  return { all, client, master, studio, admin };
}

/** All active billing plans for the plan-change dialog. */
export async function listAdminPlans(): Promise<AdminBillingPlanOption[]> {
  const plans = await prisma.billingPlan.findMany({
    where: { isActive: true },
    orderBy: [{ scope: "asc" }, { tier: "asc" }, { sortOrder: "asc" }],
    select: { id: true, code: true, name: true, tier: true, scope: true },
  });
  return plans;
}
