import { roleQuerySchema } from "@/lib/auth/schemas";
import { nonJsonBodyRefusal } from "@/lib/api/json-body-refusal";
import { ok, fail } from "@/lib/api/response";
import { requireAuth, requireAdmin } from "@/lib/auth/guards";
import { addRoleToUser, isAllowedRoleAddition } from "@/lib/auth/roles";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  const roleError = requireAdmin(auth.user);
  if (roleError) return roleError;

  // CSRF-CONTENT-TYPE-LAYER: только JSON. Ветка HTML-формы снята — вызывающих
  // у неё не было, а форма — ровно тот простой межсайтовый запрос, от которого
  // защищает третий слой.
  const nonJson = nonJsonBodyRefusal(req);
  if (nonJson) return nonJson;
  const body = await req.json().catch(() => null);
  const parsed = roleQuerySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Проверьте правильность заполнения полей.", 400, "INVALID_BODY");
  }

  const { role } = parsed.data;
  if (!isAllowedRoleAddition(role)) {
    return fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN_ROLE");
  }

  const roles = await addRoleToUser(auth.user.id, auth.user.roles, role);
  return ok({ roles });
}
