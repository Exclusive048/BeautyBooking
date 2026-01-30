import { roleQuerySchema } from "@/lib/auth/schemas";
import { ok, fail } from "@/lib/api/response";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { addRoleToUser, isAllowedRoleAddition } from "@/lib/auth/roles";

async function readBody(req: Request): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return req.json();
  }
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData();
    return { role: form.get("role") };
  }
  return req.json().catch(() => null);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const roleError = requireAdmin(auth.user);
  if (roleError) return roleError;

  const body = await readBody(req);
  const parsed = roleQuerySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid request body", 400, "INVALID_BODY");
  }

  const { role } = parsed.data;
  if (!isAllowedRoleAddition(role)) {
    return fail("Forbidden role", 403, "FORBIDDEN_ROLE");
  }

  const roles = await addRoleToUser(auth.user.id, auth.user.roles, role);
  return ok({ roles });
}
