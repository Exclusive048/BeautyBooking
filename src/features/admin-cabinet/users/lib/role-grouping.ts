import { AccountType } from "@prisma/client";
import type { AdminUserRoleGroup } from "@/features/admin-cabinet/users/types";

/**
 * Maps a primary role onto the 5-tile role group used by the filter
 * strip. Keep in sync with the `resolvePrimaryRole` priority order —
 * STUDIO and STUDIO_ADMIN both collapse to "studio", ADMIN and
 * SUPERADMIN collapse to "admin".
 */
export function roleToGroup(role: AccountType): AdminUserRoleGroup {
  if (role === AccountType.SUPERADMIN || role === AccountType.ADMIN) return "admin";
  if (role === AccountType.STUDIO || role === AccountType.STUDIO_ADMIN) return "studio";
  if (role === AccountType.MASTER) return "master";
  return "client";
}

/** AccountType-array filters for Prisma `where` clauses. Used by the
 * list endpoint and the tile-count queries — keeping the canonical
 * "studio = STUDIO ∪ STUDIO_ADMIN" mapping in one place avoids
 * `roles: { has: ... }` drift between callers. */
export const ROLE_GROUP_ACCOUNT_TYPES: Record<
  Exclude<AdminUserRoleGroup, "all">,
  AccountType[]
> = {
  client: [AccountType.CLIENT],
  master: [AccountType.MASTER],
  studio: [AccountType.STUDIO, AccountType.STUDIO_ADMIN],
  admin: [AccountType.ADMIN, AccountType.SUPERADMIN],
};
