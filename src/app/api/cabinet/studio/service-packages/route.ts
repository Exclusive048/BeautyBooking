import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { listMasterServicePackages } from "@/lib/master/services-view.service";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/service-packages";

/**
 * MOBILE-STUDIO-C (G5) — все пакеты студии, включая выключенные, в форме
 * `GET /api/master/service-packages` (`MasterServicePackagesData`). Пакеты
 * студии хранятся под Provider студии (`ServicePackage.masterId`), цена — из
 * прайса студии (`basePrice ?? price`, как у веба). Услуга «на паузе»
 * помечается выключенной (`hasDisabledComponent`). Правки — существующие
 * `/api/studio/service-packages*` со `studioId`.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const packages = await listMasterServicePackages(access.providerId, { useBasePrice: true });
    return ok({ packages }, CABINET_NO_STORE_INIT);
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить пакеты. Попробуйте ещё раз.",
    });
  }
}
