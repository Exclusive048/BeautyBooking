import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import { loadScheduleRequestWithRelations, notifyScheduleRequestRejected } from "@/lib/notifications/studio-notifications";
import { archiveScheduleChangeRequestById } from "@/lib/schedule/request-archive";

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

    const body = (await req.json().catch(() => null)) as { comment?: string } | null;
    const comment = body?.comment?.trim();
    if (!comment) {
      return jsonFail(400, "Комментарий обязателен.", "VALIDATION_ERROR");
    }

    const p = params instanceof Promise ? await params : params;
    const request = await prisma.scheduleChangeRequest.findFirst({
      where: { id: p.id, studioId: access.studioId },
      select: { id: true, status: true },
    });

    if (!request) return jsonFail(404, "Запрос не найден.", "NOT_FOUND");
    if (request.status !== "PENDING") {
      return jsonFail(400, "Запрос уже обработан.", "VALIDATION_ERROR");
    }

    await prisma.$transaction(async (tx) => {
      await tx.scheduleChangeRequest.update({
        where: { id: request.id },
        data: { status: "REJECTED", comment },
      });
      await archiveScheduleChangeRequestById(request.id, tx);
    });

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
