import type { SessionUser } from "@/lib/auth/session";
import { fail } from "@/lib/api/response";
import { hasAdminRole, requireAuth } from "@/lib/auth/guards";

type AdminAuthResult =
  | { ok: true; user: SessionUser }
  | { ok: false; response: ReturnType<typeof fail> };

export async function requireAdminAuth(): Promise<AdminAuthResult> {
  const auth = await requireAuth();
  if (!auth.ok) return auth;
  if (!hasAdminRole(auth.user)) {
    return { ok: false, response: fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN") };
  }
  return { ok: true, user: auth.user };
}
