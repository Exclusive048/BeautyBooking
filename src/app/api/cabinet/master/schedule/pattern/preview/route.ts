import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { previewSchedulePattern } from "@/lib/schedule/pattern-apply";
import { patternRequestSchema } from "@/lib/schedule/pattern-request";
import { resolveScheduleActor } from "@/lib/schedule/schedule-actor";
import { failScheduleRoute } from "@/lib/schedule/schedule-route";
import { parseBody } from "@/lib/validation";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — последний шаг пошагового окна: какие живые
 * записи новый график оставит на выходных или вне часов. Ничего не пишет;
 * тело — то же, что у `PUT /api/cabinet/master/schedule/pattern`. Доступен и
 * мастеру на профиле в студии (этап 4): он предлагает график заявкой.
 */
export async function POST(req: Request) {
  const route = "POST /api/cabinet/master/schedule/pattern/preview";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
    const body = await parseBody(req, patternRequestSchema);

    return jsonOk(await previewSchedulePattern(actor.providerId, body));
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}
