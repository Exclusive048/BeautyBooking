import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { prisma } from "@/lib/prisma";
import { requireStudioCabinetAdmin } from "@/lib/studio/cabinet-access";
import { getStudioProviderById } from "@/lib/studios/studio";
import { loadStudioSettingsData } from "@/features/studio-cabinet/settings/server/settings-data.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/settings";

const NOT_FOUND_MESSAGE = "Студия не найдена.";

/**
 * MOBILE-STUDIO-C (team) — снимок настроек студии для приложения: права
 * (`loadStudioSettingsData().scope`), владелец и администраторы (только
 * чтение — пути назначить администратора или передать студию нет), город и
 * ссылка на карту, адрес профиля и вся форма `GET /api/studios/{providerId}`
 * (`getStudioProviderById`: профиль, правила записи, видимость) — её же
 * возвращает `PATCH /api/studios/{providerId}`. Адрес профиля только читается:
 * в отличие от `GET /api/cabinet/studio/public-username`, этот запрос его не
 * создаёт.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await requireStudioCabinetAdmin(user.id);
    const [settings, profile, provider] = await Promise.all([
      loadStudioSettingsData({ studioId: access.studioId, currentUserId: user.id }),
      getStudioProviderById(access.providerId),
      prisma.provider.findUnique({
        where: { id: access.providerId },
        select: { publicUsername: true },
      }),
    ]);
    if (!settings || !profile) return fail(NOT_FOUND_MESSAGE, 404, "STUDIO_NOT_FOUND");

    return ok(
      {
        timezone: access.timezone,
        scope: {
          isOwner: settings.scope.isOwner,
          isAdmin: settings.scope.isAdmin,
          roles: settings.scope.roles,
          canDanger: settings.scope.canDanger,
          // `/api/cabinet/studio/public-username` ищет студию по владельцу.
          canEditPublicUsername: settings.scope.isOwner,
        },
        studio: {
          id: access.studioId,
          providerId: access.providerId,
          publicUsername: provider?.publicUsername ?? null,
          cityName: settings.general.address.cityName,
          mapUrl: settings.general.address.mapUrl,
          profile,
        },
        team: settings.team,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить настройки студии. Попробуйте ещё раз.",
    });
  }
}
