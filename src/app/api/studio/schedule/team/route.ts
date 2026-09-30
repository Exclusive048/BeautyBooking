import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { failScheduleRoute } from "@/lib/schedule/schedule-route";
import { loadStudioTeamBoard } from "@/lib/schedule/team-board";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";

export const runtime = "nodejs";

/**
 * SCHEDULE-PATTERNS-01 (этап 4) — «График команды»: мастера студии × 14 дней
 * с `?from=YYYY-MM-DD` (дата студии). Только чтение: день правится календарём
 * мастера, график — пошаговым окном (`/api/cabinet/master/schedule/*` с
 * `?studioId&masterId`). Доступ — владелец и администратор студии.
 */
export async function GET(req: Request) {
  const route = "GET /api/studio/schedule/team";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const access = await resolveCurrentStudioAccess(user.id);
    if (!access.roles.some((role) => role === StudioRole.OWNER || role === StudioRole.ADMIN)) {
      return jsonFail(403, "Этот раздел доступен администратору студии.", "FORBIDDEN");
    }

    const from = new URL(req.url).searchParams.get("from");
    return jsonOk({ board: await loadStudioTeamBoard(access.providerId, from) });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}
