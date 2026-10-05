import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { markStudioNotificationsRead } from "@/lib/notifications/studio-feed";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";

export const runtime = "nodejs";

const ROUTE = "POST /api/cabinet/studio/notifications/read-all";

/**
 * MOBILE-STUDIO-C (ops) — «Прочитать все» в уведомлениях студии: только
 * канал студии. Прежний веб-вызов `/api/notifications/read-all?context=all`
 * гасил и личные уведомления, и уведомления мастера. Заявки на смену графика
 * остаются — это решения. Лимит — `cabinetMutation` прокси (запись под
 * `/api/cabinet/*`). Тело не нужно.
 */
export async function POST(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    await requireStudioCabinetAdmin(user.id);
    const result = await markStudioNotificationsRead(user.id);

    return ok(result, CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось отметить уведомления прочитанными. Попробуйте ещё раз.",
    });
  }
}
