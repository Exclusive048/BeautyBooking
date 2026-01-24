import { getSessionUser } from "@/lib/auth/session";
import { ok } from "@/lib/api/response";

export async function GET() {
  const user = await getSessionUser();

  if (!user) {
    return ok({ user: null });
  }

  // Отдаем только безопасные поля
  return ok({
    user: {
      id: user.id,
      roles: user.roles,
      displayName: user.displayName ?? null,
      phone: user.phone ?? null,
      email: user.email ?? null,
    },
  });
}
