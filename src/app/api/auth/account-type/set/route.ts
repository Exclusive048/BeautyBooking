import { accountTypeQuerySchema } from "@/lib/auth/schemas";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import {
  accountTypeRedirect,
  isAllowedAccountTypeSelection,
  setAccountTypeRoles,
} from "@/lib/auth/roles";

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
    return { type: form.get("type") };
  }
  return req.json().catch(() => null);
}

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const body = await readBody(req);
  const parsed = accountTypeQuerySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Invalid request body", 400, "INVALID_BODY");
  }

  const { type } = parsed.data;
  if (!isAllowedAccountTypeSelection(type)) {
    return fail("Forbidden role", 403, "FORBIDDEN_ROLE");
  }

  const roles = await setAccountTypeRoles(auth.user.id, auth.user.roles, type);
  return ok({ roles, redirect: accountTypeRedirect(type) });
}
