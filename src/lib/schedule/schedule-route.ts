import "server-only";

import { jsonFail } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getRequestId, logError } from "@/lib/logging/logger";
import { notifyMasterScheduleUpdatedByStudio } from "@/lib/notifications/studio-notifications";
import type { ScheduleActorContext } from "@/lib/schedule/schedule-actor";

/**
 * SCHEDULE-PATTERNS-01 — общее у роутов графика, календаря и палитры
 * (`/api/cabinet/master/schedule/{pattern,calendar,palette}`): кто может
 * править, кого уведомить и как ответить на сбой. Вынесено при этапе 3, чтобы
 * у четырёх роутов не было четырёх копий правила доступа.
 */

/**
 * График, календарь и палитру правит мастер (личное расписание) и админ
 * студии (расписание мастера своей студии). Расписание профиля В СТУДИИ мастер
 * меняет только заявкой студии, а заявки в формате графика — этап 4.
 */
export function assertCanEditSchedulePlan(actor: ScheduleActorContext): void {
  if (actor.mode === "STUDIO_MASTER") {
    throw new AppError("График работы в студии настраивает администратор студии.", 403, "FORBIDDEN");
  }
}

/** Админ студии изменил расписание мастера — мастеру уведомление. */
export async function notifyStudioScheduleEdit(
  req: Request,
  actor: ScheduleActorContext,
  route: string,
  options: { quietMinutes?: number } = {},
): Promise<void> {
  if (actor.mode !== "STUDIO_ADMIN" || !actor.studioProviderId) return;
  try {
    await notifyMasterScheduleUpdatedByStudio({
      providerId: actor.providerId,
      studioProviderId: actor.studioProviderId,
      quietMinutes: options.quietMinutes,
    });
  } catch (error) {
    logError(`${route} notification failed`, {
      requestId: getRequestId(req),
      route,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
}

export function failScheduleRoute(req: Request, route: string, error: unknown) {
  const appError = toAppError(error);
  if (appError.status >= 500) {
    logError(`${route} failed`, {
      requestId: getRequestId(req),
      route,
      stack: error instanceof Error ? error.stack : undefined,
    });
  }
  return jsonFail(appError.status, appError.message, appError.code, appError.details);
}
