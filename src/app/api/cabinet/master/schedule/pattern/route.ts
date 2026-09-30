import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { submitStudioScheduleChange } from "@/lib/schedule/change-requests";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import { applySchedulePattern, previewSchedulePattern, setScheduleEnd } from "@/lib/schedule/pattern-apply";
import { patternRequestSchema } from "@/lib/schedule/pattern-request";
import { resolveScheduleActor } from "@/lib/schedule/schedule-actor";
import {
  assertCanEditSchedulePlan,
  failScheduleRoute,
  notifyStudioScheduleEdit,
} from "@/lib/schedule/schedule-route";
import { parseBody } from "@/lib/validation";

/**
 * SCHEDULE-PATTERNS-01 (этап 2) — график мастера из пошагового окна.
 *
 *   PUT   — записать график (период с даты, обрезает соседние). Ответ: снапшот
 *           настроек и записи, которые график оставил на выходных или вне
 *           часов (записи не трогаются — решение владельца 2026-09-28).
 *   PATCH — «Настроено до» / «Продлевать автоматически» (`endsOn: null`).
 *
 * Доступ — как у `/api/cabinet/master/schedule` (`resolveScheduleActor`):
 * мастер правит личное расписание, админ студии — расписание мастера своей
 * студии. Расписание профиля В СТУДИИ мастер меняет только заявкой студии:
 * `PUT` от него не пишет график, а кладёт его в открытую заявку (`CHANGES_V1`,
 * `change-requests.ts`); `PATCH` ему недоступен — дата окончания входит в заявку.
 */

export async function PUT(req: Request) {
  const route = "PUT /api/cabinet/master/schedule/pattern";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
    const body = await parseBody(req, patternRequestSchema);

    if (actor.mode === "STUDIO_MASTER") {
      if (!actor.studioProviderId) throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
      // Проверка тела и записи, которые график оставит на выходных, — тем же
      // предпросмотром, что у окна; ничего не пишется, кроме заявки (график
      // ложится в открытую заявку рядом с правками дней, а не заменяет её).
      const { conflicts } = await previewSchedulePattern(actor.providerId, body);
      const outcome = await submitStudioScheduleChange({
        req,
        route,
        providerId: actor.providerId,
        studioProviderId: actor.studioProviderId,
        change: { kind: "pattern", pattern: body },
      });
      const snapshot = await buildScheduleSnapshot(actor.providerId);
      return jsonOk({ snapshot, conflicts, request: { created: outcome === "created" } });
    }

    const { conflicts } = await applySchedulePattern(actor.providerId, body);
    await notifyStudioScheduleEdit(req, actor, route);

    const snapshot = await buildScheduleSnapshot(actor.providerId);
    return jsonOk({ snapshot, conflicts });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}

const endSchema = z.object({
  endsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
});

export async function PATCH(req: Request) {
  const route = "PATCH /api/cabinet/master/schedule/pattern";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
    assertCanEditSchedulePlan(actor);
    const body = await parseBody(req, endSchema);

    await setScheduleEnd(actor.providerId, body.endsOn);
    await notifyStudioScheduleEdit(req, actor, route);

    const snapshot = await buildScheduleSnapshot(actor.providerId);
    return jsonOk({ snapshot });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}
