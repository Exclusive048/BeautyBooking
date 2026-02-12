import { jsonFail, jsonOk } from "@/lib/api/contracts";
import { toAppError } from "@/lib/api/errors";
import { getSessionUser } from "@/lib/auth/session";
import { getRequestId, logError } from "@/lib/logging/logger";
import { resolveScheduleProvider } from "@/lib/schedule/provider-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const user = await getSessionUser();
    if (!user) return jsonFail(401, "Необходима авторизация.", "UNAUTHORIZED");

    const url = new URL(req.url);
    const providerId = url.searchParams.get("providerId");
    const provider = await resolveScheduleProvider({ userId: user.id, providerId });

    const isStudioMember = provider.type === "MASTER" && Boolean(provider.studioId);
    if (!isStudioMember) {
      return jsonOk({ mode: "solo" });
    }

    const pending = await prisma.scheduleChangeRequest.findFirst({
      where: { providerId: provider.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, createdAt: true },
    });
    const rejected = await prisma.scheduleChangeRequest.findFirst({
      where: { providerId: provider.id, status: "REJECTED" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, comment: true, updatedAt: true },
    });

    return jsonOk({
      mode: "studio_member",
      requestStatus: pending ? "PENDING" : rejected ? "REJECTED" : null,
      pendingRequestId: pending?.id ?? null,
      rejectedComment: rejected?.comment ?? null,
    });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.status >= 500) {
      logError("GET /api/provider/schedule/status failed", {
        requestId: getRequestId(req),
        route: "GET /api/provider/schedule/status",
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return jsonFail(appError.status, appError.message, appError.code, appError.details);
  }
}
