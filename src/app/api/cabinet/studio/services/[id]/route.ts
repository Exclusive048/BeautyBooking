import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { toStudioServiceJson } from "@/lib/studio/cabinet-catalog-json";
import { loadStudioServiceDetail } from "@/features/studio-cabinet/services/server/services-data.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/services/{id}";
const NOT_FOUND_MESSAGE = "Услуга не найдена.";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * MOBILE-STUDIO-C — карточка услуги студии (панель справа в веб-прайсе):
 * описание, назначенные мастера и те, кого можно назначить (только активные
 * мастера студии), статистика за 30 дней. Чужая или несуществующая услуга —
 * 404, чтобы не подтверждать её существование. Настройки записи
 * (`/booking-config`) веб в карточке не показывает — приложение читает их
 * отдельным запросом, если понадобятся.
 */
export async function GET(req: Request, ctx: RouteContext) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const { id } = await ctx.params;
    const access = await requireStudioCabinetAdmin(user.id);

    const serviceId = id?.trim() ?? "";
    if (!serviceId || serviceId.length > 64) {
      return fail(NOT_FOUND_MESSAGE, 404, "SERVICE_NOT_FOUND");
    }

    const detail = await loadStudioServiceDetail({ studioId: access.studioId, serviceId });
    if (!detail) return fail(NOT_FOUND_MESSAGE, 404, "SERVICE_NOT_FOUND");

    return ok(
      {
        service: {
          ...toStudioServiceJson(detail),
          description: detail.description,
          assignedMasters: detail.assignedMasters,
          availableMasters: detail.availableMasters,
          stats30d: detail.stats30d,
        },
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить услугу. Попробуйте ещё раз.",
    });
  }
}
