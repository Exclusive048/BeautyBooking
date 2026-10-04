import { fail, ok } from "@/lib/api/response";
import { getSessionUser } from "@/lib/auth/session";
import { CABINET_NO_STORE_INIT, cabinetReadFailure } from "@/lib/master/cabinet-json";
import { prisma } from "@/lib/prisma";
import { toLocalDateKey } from "@/lib/schedule/timezone";
import { resolveStudioCabinetAccess } from "@/lib/studio/cabinet-access";
import { getStudioSidebarCounts } from "@/features/studio-cabinet/server/sidebar-counts.service";
import { getStudioShellInfo } from "@/features/studio-cabinet/server/studio-info.service";

export const runtime = "nodejs";

const ROUTE = "GET /api/cabinet/studio/context";

/**
 * MOBILE-STUDIO-C — с чего приложение открывает кабинет студии: оба id
 * студии (`id` = Studio.id для `/api/studio/*`, `providerId` для
 * `/api/studios/{id}/**`), роли, пояс салона, «сегодня» по салону и бейджи
 * разделов. Мастер студии (роль MASTER) получает 200 с `canAdminister: false`
 * и без счётчиков — его работа со студийными записями идёт в кабинете мастера.
 * Нет членства в студии — 403 `FORBIDDEN`.
 */
export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return fail("Требуется вход в аккаунт.", 401, "UNAUTHORIZED");

    const access = await resolveStudioCabinetAccess(user.id);
    const [shell, provider, counts] = await Promise.all([
      getStudioShellInfo(access.studioId),
      prisma.provider.findUnique({
        where: { id: access.providerId },
        select: { publicUsername: true, isPublished: true },
      }),
      access.canAdminister
        ? getStudioSidebarCounts({ studioId: access.studioId, userId: user.id, phone: user.phone ?? null })
        : null,
    ]);

    return ok(
      {
        studio: {
          id: access.studioId,
          providerId: access.providerId,
          name: shell?.name ?? "",
          avatarUrl: shell?.avatarUrl ?? null,
          publicUsername: provider?.publicUsername ?? null,
          isPublished: provider?.isPublished ?? false,
          timezone: access.timezone,
          mastersCount: shell?.mastersCount ?? 0,
        },
        roles: access.roles,
        isOwner: access.isOwner,
        canAdminister: access.canAdminister,
        todayKey: toLocalDateKey(new Date(), access.timezone),
        counts: counts
          ? {
              scheduleRequestsPending: counts.scheduleRequestsPending,
              reviewsUnanswered: counts.reviewsUnanswered,
            }
          : null,
      },
      CABINET_NO_STORE_INIT,
    );
  } catch (error) {
    return cabinetReadFailure(req, error, {
      route: ROUTE,
      message: "Не удалось загрузить кабинет студии. Попробуйте ещё раз.",
    });
  }
}
