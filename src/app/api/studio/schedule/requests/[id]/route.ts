import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { prisma } from "@/lib/prisma";
import { buildScheduleRequestReview } from "@/lib/schedule/change-requests";
import { buildScheduleSnapshot } from "@/lib/schedule/editor";

export const runtime = "nodejs";

function hasAdminRole(roles: StudioRole[]) {
  return roles.some((role) => role === StudioRole.ADMIN || role === StudioRole.OWNER);
}

export async function GET(
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
      select: {
        id: true,
        status: true,
        comment: true,
        createdAt: true,
        payloadJson: true,
        provider: { select: { id: true, name: true } },
      },
    });

    if (!request) return jsonFail(404, "Запрос не найден.", "NOT_FOUND");

    // SCHEDULE-LEGACY-API-REMOVAL: текущее расписание — снапшот настроек (как
    // у кабинета) и «было → стало» заявки; сырые недельные таблицы у профиля с
    // графиком ни на что не влияют и больше не отдаются.
    const [editorSnapshot, review] = await Promise.all([
      buildScheduleSnapshot(request.provider.id),
      buildScheduleRequestReview(request.provider.id, request.payloadJson),
    ]);

    return jsonOk({
      request: {
        id: request.id,
        status: request.status,
        comment: request.comment ?? null,
        createdAt: request.createdAt.toISOString(),
        provider: request.provider,
        payload: request.payloadJson,
      },
      current: { editorSnapshot, review },
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/studio/schedule/requests/[id] failed", {
        requestId: getRequestId(req),
        route: "GET /api/studio/schedule/requests/[id]",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
