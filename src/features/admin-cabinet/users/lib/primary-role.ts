import { AccountType } from "@prisma/client";

/** Priority order — top of array wins. Higher-privilege roles "shadow"
 * lower ones, which matches how the admin UI surfaces a single role
 * badge per row instead of listing every role on the account. */
const PRIORITY: AccountType[] = [
  AccountType.SUPERADMIN,
  AccountType.ADMIN,
  AccountType.STUDIO,
  AccountType.STUDIO_ADMIN,
  AccountType.MASTER,
  AccountType.CLIENT,
];

export function resolvePrimaryRole(roles: AccountType[]): AccountType {
  for (const candidate of PRIORITY) {
    if (roles.includes(candidate)) return candidate;
  }
  // Fallback — every UserProfile is seeded with `[CLIENT]` by default
  // per `prisma/schema/auth.prisma`, so this branch is unreachable in
  // practice. Return CLIENT instead of throwing.
  return AccountType.CLIENT;
}
