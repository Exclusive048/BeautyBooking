import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { getStudioNotificationCounts } from "@/lib/notifications/studio-feed";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/notifications/unread-count";

/**
 * MOBILE-STUDIO-C (ops) — бейдж уведомлений студии: непрочитанные уведомления
 * канала студии плюс ожидающие заявки на смену графика (как KPI веб-страницы),
 * и отдельно число заявок. Лёгкий запрос для обновления по событию SSE.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    await requireStudioCabinetAdmin(user.id);
    const counts = await getStudioNotificationCounts(user.id);

    return ok(counts, CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить уведомления. Попробуйте ещё раз.",
    });
  }
}
