import { accountTypeQuerySchema } from "@/lib/auth/schemas";
import { nonJsonBodyRefusal } from "@/lib/api/json-body-refusal";
import { ok, fail } from "@/lib/api/response";
import { requireAuth } from "@/lib/auth/guards";
import {
  accountTypeRedirect,
  isAllowedAccountTypeSelection,
  setAccountTypeRoles,
} from "@/lib/auth/roles";

export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // CSRF-CONTENT-TYPE-LAYER: только JSON. Ветка HTML-формы снята — вызывающих
  // у неё не было, а форма — ровно тот простой межсайтовый запрос, от которого
  // защищает третий слой.
  const nonJson = nonJsonBodyRefusal(req);
  if (nonJson) return nonJson;
  const body = await req.json().catch(() => null);
  const parsed = accountTypeQuerySchema.safeParse(body);
  if (!parsed.success) {
    return fail("Проверьте правильность заполнения полей.", 400, "INVALID_BODY");
  }

  const { type } = parsed.data;
  if (!isAllowedAccountTypeSelection(type)) {
    return fail("Недостаточно прав для этого действия.", 403, "FORBIDDEN_ROLE");
  }

  const roles = await setAccountTypeRoles(auth.user.id, auth.user.roles, type);
  return ok({ roles, redirect: accountTypeRedirect(type) });
}
