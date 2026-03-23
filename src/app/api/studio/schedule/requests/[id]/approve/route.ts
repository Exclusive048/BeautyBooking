import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import { applySchedulePayload, type SchedulePayload } from "@/lib/schedule/unified";
import {
  applyScheduleSnapshot,
  isScheduleEditorRequestPayload,
  normalizeScheduleEditorRequestPayload,
} from "@/lib/schedule/editor";
import { loadScheduleRequestWithRelations, notifyScheduleRequestApproved } from "@/lib/notifications/studio-notifications";

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
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const access = await resolveCurrentStudioAccess(user.id);
    if (!hasAdminRole(access.roles)) {
      return jsonFail(403, "Недостаточно прав.", "FORBIDDEN");
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

    if (isScheduleEditorRequestPayload(request.payloadJson)) {
      const normalized = normalizeScheduleEditorRequestPayload(request.payloadJson);
      await applyScheduleSnapshot(request.providerId, normalized);
    } else {
      await applySchedulePayload(request.providerId, request.payloadJson as unknown as SchedulePayload);
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
