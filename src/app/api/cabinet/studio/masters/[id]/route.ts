import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { getStudioMasterServicesMatrix } from "@/lib/studio/masters.service";
import { toStudioMasterDetailJson } from "@/lib/studio/team-cabinet-json";
import { loadStudioMasterDetail } from "@/features/studio-cabinet/masters/server/master-detail.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/masters/{id}";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const paramsSchema = z.object({ id: z.string().trim().min(1).max(64) });

const NOT_FOUND_MESSAGE = "Мастер не найден.";

/**
 * MOBILE-STUDIO-C (team) — карточка мастера студии (`loadStudioMasterDetail`,
 * правая панель веб-страницы «Мастера студии»): контакты, дата прихода,
 * клиенты, средний чек, неделя расписания, профиль в студии, будущие записи,
 * мешающие исключению, и разрешённые действия; плюс матрица услуг студии ×
 * мастер (`getStudioMasterServicesMatrix`) с базовыми ценой и длительностью —
 * правится `PUT /api/studio/masters/{id}/services`.
 *
 * `id` — `Provider.id` профиля мастера в студии; он же — для всех пишущих
 * роутов команды. `studio.id` (Studio.id) — `studioId` этих роутов. Мастер не
 * из этой студии, несуществующий и невозможный по форме — один 404.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);

    const parsed = paramsSchema.safeParse(await ctx.params);
    if (!parsed.success) return fail(NOT_FOUND_MESSAGE, 404, "MASTER_NOT_FOUND");

    const detail = await loadStudioMasterDetail({
      studioId: access.studioId,
      masterId: parsed.data.id,
      currentUserId: user.id,
    });
    if (!detail) return fail(NOT_FOUND_MESSAGE, 404, "MASTER_NOT_FOUND");

    const services = await getStudioMasterServicesMatrix({
      studioId: access.studioId,
      masterId: detail.id,
    });

    return ok(
      {
        timezone: access.timezone,
        studio: { id: access.studioId, providerId: access.providerId },
        master: toStudioMasterDetailJson(detail),
        services,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить мастера. Попробуйте ещё раз.",
    });
  }
}
