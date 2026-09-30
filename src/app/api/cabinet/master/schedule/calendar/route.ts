import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { getSessionUser } from "@/lib/auth/session";
import { AppError } from "@/lib/api/errors";
import { loadScheduleCalendar, paintScheduleDays, validateCalendarRequest } from "@/lib/schedule/calendar";
import type { CalendarRequestAction, ScheduleCalendarDto } from "@/lib/schedule/calendar-shared";
import { loadPendingScheduleChanges, submitStudioScheduleChange } from "@/lib/schedule/change-requests";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";
import { resolveScheduleActor, type ScheduleActorContext } from "@/lib/schedule/schedule-actor";
import {
  assertCanEditSchedulePlan,
  failScheduleRoute,
  notifyStudioScheduleEdit,
} from "@/lib/schedule/schedule-route";
import { parseBody } from "@/lib/validation";

/**
 * SCHEDULE-PATTERNS-01 (этап 3) — календарь расписания на 3 месяца.
 *
 *   GET — дни календаря (как их видит движок окошек) и число записей на день.
 *   PUT — покрасить дни: рабочий день палитры, выходной, свои часы или «как по
 *         графику». Ответ: календарь и снапшот настроек (карточка графика и
 *         палитра читают его). Записи на днях, ставших выходными, остаются —
 *         решение владельца 2026-09-28.
 *
 * Доступ — `resolveScheduleActor`, как у графика: мастер — личное расписание,
 * админ студии — расписание мастера своей студии. Профиль в студии мастер
 * меняет только заявкой (SCHEDULE-STUDIO-PROFILE-CALENDAR): его `PUT` дописывает
 * дни в открытую заявку студии (действие `withdraw` убирает день из заявки), а
 * `GET` отдаёт вместе с календарём то, что уже отправлено (`pending`).
 */

const TIME = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const paintSchema = z.object({
  dates: z.array(DATE).min(1).max(93),
  action: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("template"), templateId: z.string().min(1).max(64) }),
    z.object({ kind: z.literal("off") }),
    z.object({ kind: z.literal("reset") }),
    // Только в режиме заявки: убрать день из заявки студии.
    z.object({ kind: z.literal("withdraw") }),
    z.object({
      kind: z.literal("hours"),
      startTime: TIME,
      endTime: TIME,
      breaks: z
        .array(z.object({ start: TIME, end: TIME, title: z.string().max(40).nullable().optional() }))
        .max(6)
        .default([]),
    }),
  ]),
});

/** Календарь профиля; у профиля в студии — с тем, что уже отправлено студии. */
async function loadCalendarForActor(actor: ScheduleActorContext): Promise<ScheduleCalendarDto> {
  const calendar = await loadScheduleCalendar(actor.providerId);
  if (actor.mode !== "STUDIO_MASTER") return calendar;
  const pending = await loadPendingScheduleChanges(actor.providerId);
  return {
    ...calendar,
    pending: pending
      ? { hasWeek: pending.week !== null, hasPattern: pending.pattern !== null, days: pending.days }
      : { hasWeek: false, hasPattern: false, days: [] },
  };
}

export async function GET(req: Request) {
  const route = "GET /api/cabinet/master/schedule/calendar";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
    return jsonOk({ calendar: await loadCalendarForActor(actor) });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}

export async function PUT(req: Request) {
  const route = "PUT /api/cabinet/master/schedule/calendar";
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Требуется вход в аккаунт.", "UNAUTHORIZED");

    const actor = await resolveScheduleActor(req, user.id);
    const body = await parseBody(req, paintSchema);
    const action: CalendarRequestAction =
      body.action.kind === "hours"
        ? {
            kind: "hours",
            startTime: body.action.startTime,
            endTime: body.action.endTime,
            breaks: body.action.breaks.map((item) => ({ ...item, title: item.title ?? null })),
          }
        : body.action;

    if (actor.mode === "STUDIO_MASTER") {
      if (!actor.studioProviderId) throw new AppError("Студия не найдена.", 404, "STUDIO_NOT_FOUND");
      const dates = await validateCalendarRequest(actor.providerId, { dates: body.dates, action });
      const outcome = await submitStudioScheduleChange({
        req,
        route,
        providerId: actor.providerId,
        studioProviderId: actor.studioProviderId,
        change: { kind: "days", dates, action },
      });
      const [calendar, snapshot] = await Promise.all([
        loadCalendarForActor(actor),
        buildScheduleSnapshot(actor.providerId),
      ]);
      return jsonOk({ calendar, snapshot, request: { outcome } });
    }

    assertCanEditSchedulePlan(actor);
    if (action.kind === "withdraw") {
      throw new AppError("Проверьте правильность заполнения полей.", 400, "INVALID_BODY");
    }
    await paintScheduleDays(actor.providerId, { dates: body.dates, action });
    // Календарь правится покраской дня за днём — мастеру одно уведомление на
    // серию правок, а не на каждый клик.
    await notifyStudioScheduleEdit(req, actor, route, { quietMinutes: 30 });

    const [calendar, snapshot] = await Promise.all([
      loadScheduleCalendar(actor.providerId),
      buildScheduleSnapshot(actor.providerId),
    ]);
    return jsonOk({ calendar, snapshot });
  } catch (error) {
    return failScheduleRoute(req, route, error);
  }
}
