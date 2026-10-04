import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { toScheduleRequestJson } from "@/features/studio-cabinet/schedule-requests/lib/request-json";
import { listScheduleRequestsForStudio } from "@/features/studio-cabinet/schedule-requests/server/list.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/schedule-requests";

/**
 * MOBILE-STUDIO-C (team) — заявки мастеров на расписание
 * (`/cabinet/studio/schedule-requests`, `listScheduleRequestsForStudio`):
 * все открытые и 20 последних решённых. Что просит мастер и «было → стало» —
 * готовым русским текстом теми же форматтерами, что карточка на вебе
 * (`buildSchedulePayloadPreview`, `buildReviewPreview`). Решения — прежние
 * `POST /api/studio/schedule/requests/{id}/approve|reject`.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const lists = await listScheduleRequestsForStudio(access.studioId);

    return ok(
      {
        timezone: access.timezone,
        pending: lists.pending.map(toScheduleRequestJson),
        resolved: lists.resolved.map(toScheduleRequestJson),
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить заявки на расписание. Попробуйте ещё раз.",
    });
  }
}
