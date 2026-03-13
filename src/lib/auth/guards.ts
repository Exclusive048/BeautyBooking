import type { UserProfile } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { fail } from "@/lib/api/response";
import { getSessionUser, getSessionUserFromRequest } from "@/lib/auth/session";

type AuthResult =
  | { ok: true; user: UserProfile }
  | { ok: false; response: ReturnType<typeof fail> };

export async function requireAuth(): Promise<AuthResult> {
  const user = await getSessionUser();
  if (!user) {
    return { ok: false, response: fail("Unauthorized", 401, "UNAUTHORIZED") };
  }
  return { ok: true, user };
}

export async function requireSession(): Promise<AuthResult> {
  return requireAuth();
}

export async function requireAuthFromRequest(req: Request): Promise<AuthResult> {
  const user = await getSessionUserFromRequest(req);
  if (!user) {
    return { ok: false, response: fail("Unauthorized", 401, "UNAUTHORIZED") };
  }
  return { ok: true, user };
}

export async function requireSessionFromRequest(req: Request): Promise<AuthResult> {
  return requireAuthFromRequest(req);
}

type RoleAware = Pick<UserProfile, "roles">;

export function hasAnyRole(user: RoleAware, roles: readonly AccountType[]): boolean {
  return roles.some((role) => user.roles.includes(role));
}

export function hasAdminRole(user: RoleAware): boolean {
  return hasAnyRole(user, [AccountType.ADMIN, AccountType.SUPERADMIN]);
}

export function requireAdmin(user: RoleAware) {
  if (!hasAdminRole(user)) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}

export function requireAnyRole(user: RoleAware, roles: readonly AccountType[]) {
  if (!hasAnyRole(user, roles)) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}

export function requireRole(user: RoleAware, role: AccountType) {
  return requireAnyRole(user, [role]);
}
