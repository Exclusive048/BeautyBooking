import { z } from "zod";
import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { toStudioServiceJson } from "@/lib/studio/cabinet-catalog-json";
import { parseQuery } from "@/lib/validation";
import {
  listAvailableCategoriesForStudio,
  loadStudioServicesKpis,
  loadStudioServicesListData,
} from "@/features/studio-cabinet/services/server/services-data.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/services";

const querySchema = z.object({
  categoryId: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().max(80).optional(),
});

/**
 * MOBILE-STUDIO-C — прайс студии (`/cabinet/studio/services`) одним ответом:
 * KPI, сайдбар категорий каталога со счётчиками, варианты для выбора категории
 * и услуги. Те же сервисы, что у веб-страницы; без `categoryId` — весь прайс
 * (веб открывает первую категорию), `__uncategorized__` — «Без категории».
 * Порядок услуг — `sortOrder`, затем дата создания. Постраничности нет: у
 * студии десятки услуг, а KPI и счётчики считаются по всем.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const query = parseQuery(new URL(req.url), querySchema);
    const access = await requireStudioCabinetAdmin(user.id);

    const [list, kpis, pickerCategories] = await Promise.all([
      loadStudioServicesListData({
        studioId: access.studioId,
        currentUserId: user.id,
        categoryId: query.categoryId ?? null,
        search: query.q ?? "",
        categoryFallback: "all",
      }),
      loadStudioServicesKpis(access.studioId),
      listAvailableCategoriesForStudio(user.id),
    ]);

    return ok(
      {
        kpis,
        categories: list.categories.map((category) => ({
          id: category.id,
          name: category.title,
          icon: category.icon,
          status: category.status,
          servicesCount: category.servicesCount,
        })),
        pickerCategories,
        categoryId: list.selectedCategoryId,
        q: query.q ?? "",
        items: list.items.map(toStudioServiceJson),
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить услуги. Попробуйте ещё раз.",
    });
  }
}
