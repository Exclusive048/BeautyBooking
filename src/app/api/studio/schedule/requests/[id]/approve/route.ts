import { StudioRole } from "@prisma/client";
import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveCurrentStudioAccess } from "@/lib/studio/current";
import { loadScheduleRequestWithRelations, notifyScheduleRequestApproved } from "@/lib/notifications/studio-notifications";
import { approveScheduleChangeRequest } from "@/lib/schedule/change-requests";

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
    // SCHEDULE-REQUEST-ATOMIC: блокировка заявки, проверка статуса, применение
    // расписания и смена статуса — одной транзакцией (`change-requests.ts`).
    // Уже обработанная заявка — 409; тело, которое нельзя применить, — 422 с
    // просьбой отправить заявку заново (STUDIO-APPROVE-400-FIX-A).
    const request = await approveScheduleChangeRequest({ requestId: p.id, studioId: access.studioId });

    // Уведомление — после коммита одобрения: мастер не должен прочитать
    // «одобрено» о заявке, которая откатилась.
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
