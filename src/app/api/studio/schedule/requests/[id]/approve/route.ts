import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { AppError, toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import {
  applyScheduleSnapshot,
  isScheduleEditorRequestPayload,
  normalizeScheduleEditorRequestPayload,
} from "@/lib/schedule/editor";
import { loadScheduleRequestWithRelations, notifyScheduleRequestApproved } from "@/lib/notifications/studio-notifications";
import { applyScheduleChangesRequest } from "@/lib/schedule/change-requests";
import { approvePatternChangeRequest } from "@/lib/schedule/pattern-apply";
import { isScheduleChangesPayload } from "@/lib/schedule/schedule-changes-shared";
import { isPatternChangeRequestPayload } from "@/lib/schedule/patterns-shared";

export const runtime = "nodejs";

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

    const p = params instanceof Promise ? await params : params;
    const request = await prisma.scheduleChangeRequest.findFirst({
      where: { id: p.id, studioId: access.studioId },
      select: { id: true, status: true, providerId: true, payloadJson: true },
    });

    if (!request) return jsonFail(404, "Запрос не найден.", "NOT_FOUND");
    if (request.status !== "PENDING") {
      return jsonFail(400, "Запрос уже обработан.", "VALIDATION_ERROR");
    }

    // STUDIO-APPROVE-400-FIX-A: rewrap INVALID_BODY failures from the
    // schedule appliers into a friendlier message. The default
    // "Некорректное тело запроса" is honest from the server side but
    // confusing for the studio admin — they did not author the
    // payload, the master did. Surface a 422 with actionable copy
    // explaining what to do (ask the master to resend) and preserve
    // the original code for log/debug. This is defensive: with the
    // seed fix in place a properly-formed payload won't trip it, but
    // legacy or migration-corrupted rows still might.
    try {
      if (isScheduleChangesPayload(request.payloadJson)) {
        // SCHEDULE-STUDIO-PROFILE-CALENDAR: накопленные правки — неделя или
        // график и дни календаря — одной транзакцией.
        await applyScheduleChangesRequest(request.providerId, request.payloadJson);
      } else if (isPatternChangeRequestPayload(request.payloadJson)) {
        // SCHEDULE-PATTERNS-01 (этап 4): заявка мастера в формате графика.
        await approvePatternChangeRequest(request.providerId, request.payloadJson.request);
      } else if (isScheduleEditorRequestPayload(request.payloadJson)) {
        const normalized = normalizeScheduleEditorRequestPayload(request.payloadJson);
        await applyScheduleSnapshot(request.providerId, normalized);
      } else {
        // SCHEDULE-PATTERNS-01: заявка старого формата (`{ templates, weekly,
        // overrides }`) писала бы в недельную таблицу, а у профиля с графиком
        // неделя — только история: одобрение молча ничего бы не изменило.
        // Интерфейс такие заявки не создаёт; отказ ниже превращается в 422 с
        // просьбой отправить заявку заново.
        throw new AppError("Заявка в старом формате.", 400, "INVALID_BODY");
      }
    } catch (error) {
      const inner = error instanceof AppError ? error : toAppError(error);
      if (inner.status === 400 && inner.code === "INVALID_BODY") {
        throw new AppError(
          "Не удалось применить расписание: данные запроса повреждены или устарели. Попросите мастера отправить заявку заново.",
          422,
          "INVALID_REQUEST_PAYLOAD",
        );
      }
      throw inner;
    }

    await prisma.scheduleChangeRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED" },
    });

    try {
      const fullRequest = await loadScheduleRequestWithRelations(request.id);
      if (fullRequest) {
        await notifyScheduleRequestApproved(fullRequest);
      }
    } catch (error) {
      logError("POST /api/studio/schedule/requests/[id]/approve notification failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/schedule/requests/[id]/approve",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return jsonOk({ id: request.id, status: "APPROVED" });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("POST /api/studio/schedule/requests/[id]/approve failed", {
        requestId: getRequestId(req),
        route: "POST /api/studio/schedule/requests/[id]/approve",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
