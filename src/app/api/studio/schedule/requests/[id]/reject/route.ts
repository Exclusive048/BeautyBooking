import { StudioRole } from "@prisma/client";
import { z } from "zod";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import { loadScheduleRequestWithRelations, notifyScheduleRequestRejected } from "@/lib/notifications/studio-notifications";
import { scheduleRequestProcessedError } from "@/lib/schedule/change-request-conflict";
import { SCHEDULE_REQUEST_REJECT_COMMENT_MAX } from "@/features/studio-cabinet/schedule-requests/lib/reject-comment";
import { nonJsonBodyRefusal } from "@/lib/api/json-body-refusal";

export const runtime = "nodejs";

const COMMENT_REQUIRED = "Комментарий обязателен.";
const COMMENT_TOO_LONG = `Комментарий — не длиннее ${SCHEDULE_REQUEST_REJECT_COMMENT_MAX} символов.`;

/**
 * MOBILE-POLISH: длина комментария ограничена и на сервере — он уходит мастеру
 * в уведомлении. Отказ — 400 `VALIDATION_ERROR` с текстом и `fieldErrors.comment`.
 */
const bodySchema = z.object(
  {
    comment: z
      .string({ error: COMMENT_REQUIRED })
      .trim()
      .min(1, COMMENT_REQUIRED)
      .max(SCHEDULE_REQUEST_REJECT_COMMENT_MAX, COMMENT_TOO_LONG),
  },
  { error: COMMENT_REQUIRED },
);

function hasAdminRole(roles: StudioRole[]) {
  return roles.some((role) => role === StudioRole.ADMIN || role === StudioRole.OWNER);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Войдите в аккаунт, чтобы продолжить.", "UNAUTHORIZED");

    const access = await resolveCurrentStudioAccess(user.id);
    if (!hasAdminRole(access.roles)) {
      return jsonFail(403, "Этот раздел доступен администратору студии.", "FORBIDDEN");
    }

    const nonJson = nonJsonBodyRefusal(req);
    if (nonJson) return nonJson;
    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? COMMENT_REQUIRED;
      return jsonFail(400, message, "VALIDATION_ERROR", undefined, { comment: message });
    }
    const { comment } = parsed.data;

    const p = params instanceof Promise ? await params : params;
    const request = await prisma.scheduleChangeRequest.findFirst({
      where: { id: p.id, studioId: access.studioId },
      select: { id: true, status: true },
    });

    if (!request) return jsonFail(404, "Запрос не найден.", "NOT_FOUND");
    if (request.status !== "PENDING") throw scheduleRequestProcessedError();

    // SCHEDULE-REQUEST-ATOMIC: статус меняется только у ещё открытой заявки.
    // Проверка выше читает без блокировки, а между ней и записью заявку мог
    // одобрить второй администратор — тогда расписание уже применено, и
    // безусловная запись поставила бы «отклонена» поверх применённой заявки.
    // UPDATE ждёт блокировку строки, взятую одобрением, и перепроверяет условие
    // на свежей версии строки: проигравший получает 409.
    const rejected = await prisma.scheduleChangeRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: { status: "REJECTED", comment },
    });
    if (rejected.count === 0) throw scheduleRequestProcessedError();

    try {
      const fullRequest = await loadScheduleRequestWithRelations(request.id);
      if (fullRequest) {
        await notifyScheduleRequestRejected(fullRequest);
      }
    } catch (error) {
      logError("POST /api/studio/schedule/requests/[id]/reject notification failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/schedule/requests/[id]/reject",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return jsonOk({ id: request.id, status: "REJECTED" });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/schedule/requests/[id]/reject failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/schedule/requests/[id]/reject",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
