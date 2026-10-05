import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { loadStudioPortfolioView } from "@/lib/studios/portfolio-view";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/portfolio";

/**
 * MOBILE-STUDIO-C (§7) — портфолио студии для приложения одним ответом: фото
 * с подписями «мастер · услуга», баннер, главное фото каталога, варианты
 * подписи и лимит тарифа. `providerId` — `entityId` загрузки
 * (`POST /api/media`, `entityType=STUDIO`, `kind=PORTFOLIO`) и путь подписи
 * (`PATCH /api/studios/{providerId}/portfolio/{assetId}`).
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const view = await loadStudioPortfolioView({ studioProviderId: access.providerId, userId: user.id });

    return ok(
      {
        providerId: access.providerId,
        timezone: access.timezone,
        photos: view.photos,
        masters: view.masters,
        services: view.services,
        limit: view.limit,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить портфолио. Попробуйте ещё раз.",
    });
  }
}
