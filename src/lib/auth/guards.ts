import type { UserProfile } from "@prisma/client";
import { AccountType } from "@prisma/client";
import { fail } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";

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

export function requireRole(user: UserProfile, role: AccountType) {
  if (!user.roles.includes(role)) {
    return fail("Forbidden", 403, "FORBIDDEN");
  }
  return null;
}
